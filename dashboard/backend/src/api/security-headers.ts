// Security response headers: Content-Security-Policy and the hardening set that goes with it.
//
// The dashboard is same-origin by design. No CORS headers are emitted, so browsers refuse to let
// other sites read its responses, and cross-site requests must pass a preflight the API does not
// answer. Embedding in a frame is denied unless FRAME_ANCESTORS names the embedding site.

const DEFAULT_FRAME_ANCESTORS = "'none'";

// Permitted characters for the operator-supplied frame-ancestors list. This keeps a stray `;` or
// newline in an environment variable from smuggling extra directives into the policy.
const SAFE_FRAME_ANCESTORS = /^[A-Za-z0-9:/.*'\- ]+$/;

// A Host header worth trusting for building the WebSocket origin: hostname or IP, optional port.
const SAFE_HOST = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

export function resolveFrameAncestors(configured: string | undefined): string {
  const value = (configured || '').trim();
  return value && SAFE_FRAME_ANCESTORS.test(value) ? value : DEFAULT_FRAME_ANCESTORS;
}

/**
 * Builds the CSP for one response. Scripts may only come from this origin and the pinned CDN
 * (whose files also carry Subresource Integrity hashes in index.html); inline scripts and eval are
 * not allowed. Inline styles remain allowed because components style elements with `style=`.
 */
export function buildContentSecurityPolicy(host: string | undefined, frameAncestors: string): string {
  const socketOrigins = host && SAFE_HOST.test(host) ? `ws://${host} wss://${host}` : 'ws: wss:';
  return [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://cdn.jsdelivr.net",
    "media-src 'self' blob:",
    `connect-src 'self' ${socketOrigins}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`
  ].join('; ');
}

/** Registers an onSend hook that applies the security headers to every response. */
export function registerSecurityHeaders(fastify: any): void {
  const frameAncestors = resolveFrameAncestors(process.env.FRAME_ANCESTORS);
  const frameable = frameAncestors !== DEFAULT_FRAME_ANCESTORS;

  fastify.addHook('onSend', async (request: any, reply: any, payload: any) => {
    reply.header('Content-Security-Policy', buildContentSecurityPolicy(request.headers.host, frameAncestors));
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    if (!frameable) {
      reply.header('X-Frame-Options', 'DENY');
    }

    // Only announce HSTS on connections that are actually secure (directly or via a trusted proxy).
    if (request.protocol === 'https') {
      reply.header('Strict-Transport-Security', 'max-age=15552000');
    }

    // API responses carry session tokens and live data; never let a browser or proxy keep a copy.
    if (typeof request.url === 'string' && request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
    }
    return payload;
  });
}
