// Authentication Service Subsystem (Production Hardened)
import crypto from 'crypto';
import { DatabaseAdapter } from '../../database/adapter';
import { UsersRepository } from '../../database/repositories/users';
import { Logger } from '../../utils/logger';
import { User } from '../../types';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
  exp?: number;
  /** Unix time at which the session began; carried through every renewal. */
  ss?: number;
}

const TOKEN_TTL_SECONDS = 2 * 60 * 60;
const WS_TICKET_TTL_MS = 30 * 1000;
const DEFAULT_MAX_SESSION_HOURS = 12;

export class AuthService {
  private usersRepo: UsersRepository;
  private jwtSecret: string;
  private dummySalt = crypto.randomBytes(16).toString('hex');
  private wsTickets = new Map<string, { userId: string; expiresAt: number }>();
  private maxSessionSeconds: number;
  private revocationListeners: Array<(userId: string) => void> = [];

  constructor(db: DatabaseAdapter) {
    this.usersRepo = new UsersRepository(db);

    const secret =
      process.env.JWT_SECRET ||
      (process.env.NODE_ENV !== 'production' ? crypto.randomBytes(32).toString('hex') : undefined);
    if (!secret) {
      throw new Error('FATAL: JWT_SECRET environment variable must be set in production mode');
    }
    this.jwtSecret = secret;

    const configuredHours = Number(process.env.SESSION_MAX_HOURS);
    this.maxSessionSeconds =
      (Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : DEFAULT_MAX_SESSION_HOURS) * 3600;
  }

  // 1. Generate salt and hash for a password
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  // 1.5 Compare raw password with stored salt:hash
  comparePassword(rawPassword: string, storedHash: string): boolean {
    if (!storedHash) return false;
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    return this.hashMatches(rawPassword, salt, hash);
  }

  // Constant-time comparison of a password against a stored scrypt hash. Length is checked first
  // because timingSafeEqual throws on unequal buffers.
  private hashMatches(rawPassword: string, salt: string, expectedHex: string): boolean {
    const computed = crypto.scryptSync(rawPassword, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
  }

  // 2. Validate user login credentials
  login(username: string, rawPassword: string): string | null {
    const user = this.usersRepo.findByUsername(username);
    if (!user || !user.password) {
      // Spend the same scrypt cost as a real check so response time does not reveal whether the
      // username exists.
      crypto.scryptSync(rawPassword, this.dummySalt, 64);
      Logger.warn('AuthService', `User login failed: Username [${username}] not found`);
      return null;
    }

    const parts = user.password.split(':');
    if (parts.length !== 2) {
      Logger.error('AuthService', `User [${username}] has malformed password hash format`);
      return null;
    }

    const [salt, hash] = parts;
    if (!this.hashMatches(rawPassword, salt, hash)) {
      Logger.warn('AuthService', `User login failed: Invalid credentials for user [${username}]`);
      return null;
    }

    const token = this.issueToken(user);
    Logger.info('AuthService', `User [${username}] logged in successfully. Role: ${user.role}`);
    return token;
  }

  /**
   * Issues a session token bound to the user's current token version, so bumping that version
   * (logout, password change) invalidates every token issued before it.
   */
  issueToken(user: User, sessionStart?: number): string {
    return this.signJwt({
      id: user.id,
      username: user.username,
      role: user.role,
      tv: user.tokenVersion ?? 0,
      ss: sessionStart ?? Math.floor(Date.now() / 1000)
    });
  }

  /**
   * Produces a fresh token for a live session, or null once the session has outlived the
   * absolute lifetime. Renewal keeps a busy session alive but never lets one run forever.
   */
  renewToken(session: AuthenticatedUser): string | null {
    const user = this.usersRepo.findById(session.id);
    if (!user) return null;
    const sessionStart = session.ss ?? Math.floor(Date.now() / 1000);
    if (Math.floor(Date.now() / 1000) - sessionStart > this.maxSessionSeconds) return null;
    return this.issueToken(user, sessionStart);
  }

  /** Registers a callback fired after a user's sessions are revoked (used to close their sockets). */
  onSessionsRevoked(listener: (userId: string) => void): void {
    this.revocationListeners.push(listener);
  }

  /** Invalidates every outstanding token for the user (sign out everywhere). */
  revokeSessions(userId: string): void {
    this.usersRepo.bumpTokenVersion(userId);
    Logger.info('AuthService', `All sessions revoked for user [${userId}]`);
    for (const listener of this.revocationListeners) {
      try {
        listener(userId);
      } catch (err: any) {
        Logger.error('AuthService', `Session revocation listener failed: ${err.message}`);
      }
    }
  }

  // 3. Verify signed JWT token and extract payload. The user is re-read from the database on every
  // call, so deleted users, role changes and revoked sessions take effect immediately.
  verifyToken(token: string): AuthenticatedUser | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, body, signature] = parts;

      const expectedSignature = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(`${header}.${body}`)
        .digest('base64url');

      const givenBuf = Buffer.from(signature);
      const expectedBuf = Buffer.from(expectedSignature);
      if (givenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(givenBuf, expectedBuf)) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
        return null;
      }

      const user = this.usersRepo.findById(payload.id);
      if (!user) return null;
      if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) return null;

      return {
        id: user.id,
        username: user.username,
        role: user.role,
        exp: payload.exp,
        ss: payload.ss ?? (payload.exp ? payload.exp - TOKEN_TTL_SECONDS : undefined)
      };
    } catch {
      return null;
    }
  }

  // 4. Custom JWT Signer (zero external dependencies)
  signJwt(payload: any): string {
    const exp = payload.exp || (Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS);
    const fullPayload = { ...payload, exp };
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  /**
   * Issues a single-use ticket that lets a browser open a WebSocket without putting its session
   * token in the URL, where proxies and access logs would record it.
   */
  issueWsTicket(userId: string): string {
    const now = Date.now();
    for (const [key, entry] of this.wsTickets) {
      if (entry.expiresAt <= now) this.wsTickets.delete(key);
    }
    const ticket = crypto.randomBytes(24).toString('base64url');
    this.wsTickets.set(ticket, { userId, expiresAt: now + WS_TICKET_TTL_MS });
    return ticket;
  }

  /** Consumes a ticket. Returns the user it was issued to, or null if unknown, used or expired. */
  redeemWsTicket(ticket: unknown): AuthenticatedUser | null {
    if (typeof ticket !== 'string' || !ticket) return null;
    const entry = this.wsTickets.get(ticket);
    this.wsTickets.delete(ticket);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    const user = this.usersRepo.findById(entry.userId);
    return user ? { id: user.id, username: user.username, role: user.role } : null;
  }
}
export default AuthService;
