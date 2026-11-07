import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { AppError } from './errors';

/**
 * SSRF guard for verifier fetches: the URL comes from the party being paid, so we refuse
 * anything that resolves to loopback, private, link-local or otherwise internal addresses.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, 'SSRF_BLOCKED', `Not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AppError(400, 'SSRF_BLOCKED', `Only http(s) URLs can be verified (got ${url.protocol})`);
  }
  if (url.username || url.password) throw new AppError(400, 'SSRF_BLOCKED', 'URLs with credentials are not allowed');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) {
    throw new AppError(400, 'SSRF_BLOCKED', `Host ${host} is internal`);
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new AppError(400, 'SSRF_BLOCKED', `Host ${host} resolves to a non-public address`);
    }
  }
  return url;
}

export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a = 0, b = 0] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateAddress(mapped[1]);
  return false;
}
