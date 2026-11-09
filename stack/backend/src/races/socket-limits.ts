import type { IncomingHttpHeaders } from 'node:http';

/**
 * The client IP used for limits, resolved like Express's `trust proxy` hop count: each trusted proxy
 * appends the address it received the request from, so the client is the entry `trustProxy` places
 * from the right. Entries further left are client-supplied and can be forged, so they are never used.
 * With trustProxy = 0 the socket's own address is used.
 */
export function clientIp(headers: IncomingHttpHeaders, remoteAddress: string | undefined, trustProxy: number): string {
  if (trustProxy > 0) {
    const raw = headers['x-forwarded-for'];
    const list = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (list.length > 0) return list[Math.max(0, list.length - trustProxy)]!;
  }
  return remoteAddress ?? 'unknown';
}

export interface SocketCaps {
  perIp: number;
  total: number;
}

/** Counts open race sockets per IP and in total. A refused socket is never counted, so releasing it is a mistake. */
export class SocketLimiter {
  private total = 0;
  private readonly perIp = new Map<string, number>();

  constructor(private readonly caps: SocketCaps) {}

  /** Counts the socket if both caps allow it. Returns false when it must be refused. */
  tryAdd(ip: string): boolean {
    if (this.total >= this.caps.total) return false;
    const held = this.perIp.get(ip) ?? 0;
    if (held >= this.caps.perIp) return false;
    this.perIp.set(ip, held + 1);
    this.total++;
    return true;
  }

  /** Gives back a slot taken by tryAdd. */
  release(ip: string): void {
    const held = this.perIp.get(ip);
    if (!held) return;
    if (held <= 1) this.perIp.delete(ip);
    else this.perIp.set(ip, held - 1);
    this.total--;
  }

  get count(): number {
    return this.total;
  }
}
