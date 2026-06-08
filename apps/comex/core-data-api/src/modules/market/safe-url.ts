import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Hostnames allowed as fetch targets for market sync. Keep this tight — every
 * entry is an exact hostname match (no subdomain wildcards).
 *
 * Override via MARKET_SYNC_ALLOWED_HOSTS (comma-separated) when needed.
 */
const DEFAULT_ALLOWED_HOSTS = ['comexlive.org'];

function allowedHosts(): Set<string> {
  const fromEnv = (process.env.MARKET_SYNC_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set(fromEnv.length ? fromEnv : DEFAULT_ALLOWED_HOSTS);
}

/** True for loopback, private (RFC1918), link-local, CGNAT and IPv6 equivalents. */
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique local
  if (v.startsWith('fe80')) return true; // link-local
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice('::ffff:'.length));
  return false;
}

/**
 * Validate a user-supplied URL before fetching it server-side (SSRF guard):
 * only http(s), hostname must be on the allowlist, and every resolved address
 * must be a public IP. Throws on any violation.
 *
 * Note: there is a residual TOCTOU/DNS-rebinding window between this lookup and
 * the actual fetch. The hostname allowlist is the primary defense; callers must
 * also disable redirect following (`redirect: 'error'`).
 */
export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid sourceUrl');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!allowedHosts().has(host)) {
    throw new Error(`Host not allowed: ${host}`);
  }

  const resolved = await lookup(host, { all: true });
  if (!resolved.length) {
    throw new Error(`Could not resolve host: ${host}`);
  }
  for (const { address } of resolved) {
    if (isPrivateIp(address)) {
      throw new Error('Resolved address is not allowed');
    }
  }

  return url;
}
