// Cache policy for the served frontend files.

const REVALIDATED_EXTENSIONS = ['.html', '.js', '.css'];

/**
 * Passed to @fastify/static as `setHeaders`. HTML, script and stylesheet responses must be
 * revalidated on every load so a redeployed dashboard is never served from a stale browser cache.
 *
 * @param reply - The Fastify reply for the file being sent. (@fastify/static 8 and later pass the
 *   reply itself, not the raw Node response, so headers are set with `reply.header`.)
 * @param filePath - Absolute path of the file being served.
 */
export function applyStaticCacheHeaders(reply: any, filePath: string): void {
  if (REVALIDATED_EXTENSIONS.some((ext) => filePath.endsWith(ext))) {
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
  }
}
