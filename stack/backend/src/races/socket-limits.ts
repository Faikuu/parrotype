import type { IncomingHttpHeaders } from 'node:http';

/**
 * The client IP used for limits. The first X-Forwarded-For entry only when a proxy is trusted
 * (trustProxy > 0); otherwise the socket's own address.
 */
export function clientIp(headers: IncomingHttpHeaders, remoteAddress: string | undefined, trustProxy: number): string {
  if (trustProxy > 0) {
    const raw = headers['x-forwarded-for'];
    const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
    if (first) return first;
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
