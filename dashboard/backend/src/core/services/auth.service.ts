// Authentication and RBAC Service Subsystem (Zero-Dependency)
import crypto from 'crypto';
import { DatabaseAdapter } from '../../database/adapter';
import { UsersRepository } from '../../database/repositories/users';
import { Logger } from '../../utils/logger';

export class AuthService {
  private usersRepo: UsersRepository;
  private jwtSecret: string;

  constructor(db: DatabaseAdapter) {
    this.usersRepo = new UsersRepository(db);
    this.jwtSecret = process.env.JWT_SECRET || 'homelab-secret-key-32-chars-long-1234';
  }

  // 1. Hash a raw password using built-in scrypt
  hashPassword(password: string, salt: string = 'salt123'): string {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  // 2. Validate user login credentials and return signed JWT
  login(username: string, rawPassword: string): string | null {
    const user = this.usersRepo.findByUsername(username);
    if (!user) {
      Logger.warn('AuthService', `User login failed: Username [${username}] not found`);
      return null;
    }

    // Hash raw input password and match (legacy mock bypass check included)
    const matched = user.password === rawPassword || user.password === this.hashPassword(rawPassword);
    if (!matched) {
      Logger.warn('AuthService', `User login failed: Invalid credentials for user [${username}]`);
      return null;
    }

    // Generate signed JWT payload
    const token = this.signJwt({ id: user.id, username: user.username, role: user.role });
    Logger.info('AuthService', `User [${username}] logged in successfully. Role: ${user.role}`);
    return token;
  }

  // 3. Verify signed JWT token and extract payload
  verifyToken(token: string): { id: string; username: string; role: string } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, body, signature] = parts;
      
      const expectedSignature = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(`${header}.${body}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return null;
      }

      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  // 4. Custom JWT Signer (zero external dependencies)
  private signJwt(payload: any): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  // 5. Evaluate role access permissions
  hasPermission(role: string, permission: string): boolean {
    if (role === 'super-admin') return true;

    const rolePermissions: Record<string, string[]> = {
      admin: [
        'start_container', 'stop_container', 'restart_container',
        'edit_settings', 'view_logs', 'view_audit', 'backup_run',
        'designer_deploy', 'workflow_write'
      ],
      operator: ['start_container', 'stop_container', 'restart_container', 'view_logs'],
      viewer: ['view_dashboard']
    };

    const allowed = rolePermissions[role] || [];
    return allowed.includes(permission);
  }
}
export default AuthService;
