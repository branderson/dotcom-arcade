import { BlockList, isIP } from 'net';
import type { Request } from 'express';
import { config } from '../config';
import { logger } from './logger';

let proxies: BlockList | null = null;

/** Parses TRUSTED_PROXIES entries: addresses or CIDR ranges, IPv4 or IPv6. */
export function buildBlockList(entries: readonly string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const [address, prefix] = entry.split('/');
    const family = isIP(address);
    if (!family) {
      logger.warn(`[TrustedHeader] Ignoring invalid TRUSTED_PROXIES entry: ${entry}`);
      continue;
    }
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) {
      list.addAddress(address, type);
    } else {
      list.addSubnet(address, parseInt(prefix, 10), type);
    }
  }
  return list;
}

export function isTrustedHeaderEnabled(): boolean {
  return Boolean(config.trustedHeaderUsername && config.trustedProxies.length > 0);
}

/** Whether the connection itself, not a forwarded-for header, comes from a trusted proxy. */
function fromTrustedProxy(req: Request): boolean {
  proxies ??= buildBlockList(config.trustedProxies);
  let address = req.socket.remoteAddress ?? '';
  // IPv4 clients on a dual-stack socket appear as ::ffff:a.b.c.d
  if (address.startsWith('::ffff:') && isIP(address.slice(7)) === 4) {
    address = address.slice(7);
  }
  const family = isIP(address);
  return family !== 0 && proxies.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function header(req: Request, name: string | null): string | null {
  if (!name) return null;
  const value = req.headers[name.toLowerCase()];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The identity a trusted proxy vouches for on this request, or null when the
 * feature is off, the connection isn't from a trusted proxy, or no user is set.
 */
export function getTrustedIdentity(
  req: Request
): { username: string; email: string | null } | null {
  if (!isTrustedHeaderEnabled() || !fromTrustedProxy(req)) {
    return null;
  }
  const username = header(req, config.trustedHeaderUsername);
  return username ? { username, email: header(req, config.trustedHeaderEmail) } : null;
}
