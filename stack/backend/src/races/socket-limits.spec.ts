import { clientIp, SocketLimiter } from './socket-limits';

describe('socket limits', () => {
  describe('clientIp', () => {
    it('ignores X-Forwarded-For when no proxy is trusted', () => {
      expect(clientIp({ 'x-forwarded-for': '198.51.100.7' }, '10.1.1.1', 0)).toBe('10.1.1.1');
    });

    it('uses the first X-Forwarded-For entry when a proxy is trusted', () => {
      expect(clientIp({ 'x-forwarded-for': '198.51.100.7, 10.0.0.2' }, '10.1.1.1', 1)).toBe('10.0.0.2');
      // A forged left-most entry is ignored: the trusted proxy's appended entry wins.
      expect(clientIp({ 'x-forwarded-for': '6.6.6.6, 203.0.113.5' }, '10.1.1.1', 1)).toBe('203.0.113.5');
    });

    it('falls back to the socket address when a trusted proxy sent no usable header', () => {
      expect(clientIp({}, '10.1.1.1', 1)).toBe('10.1.1.1');
      expect(clientIp({ 'x-forwarded-for': ' , ' }, '10.1.1.1', 1)).toBe('10.1.1.1');
    });

    it('reads a repeated header from its first value', () => {
      expect(clientIp({ 'x-forwarded-for': ['198.51.100.9', '10.0.0.2'] }, '10.1.1.1', 2)).toBe('198.51.100.9');
    });

    it('returns "unknown" when there is no address at all', () => {
      expect(clientIp({}, undefined, 0)).toBe('unknown');
    });
  });

  describe('SocketLimiter', () => {
    it('refuses the socket after the per-IP cap, and other IPs are unaffected', () => {
      const limiter = new SocketLimiter({ perIp: 2, total: 100 });
      expect(limiter.tryAdd('a')).toBe(true);
      expect(limiter.tryAdd('a')).toBe(true);
      expect(limiter.tryAdd('a')).toBe(false);
      expect(limiter.tryAdd('b')).toBe(true);
      expect(limiter.count).toBe(3);
    });

    it('refuses once the total cap is reached, whatever the IP', () => {
      const limiter = new SocketLimiter({ perIp: 10, total: 2 });
      expect(limiter.tryAdd('a')).toBe(true);
      expect(limiter.tryAdd('b')).toBe(true);
      expect(limiter.tryAdd('c')).toBe(false);
    });

    it('frees a slot on release, and a refused socket is not counted', () => {
      const limiter = new SocketLimiter({ perIp: 1, total: 10 });
      expect(limiter.tryAdd('a')).toBe(true);
      expect(limiter.tryAdd('a')).toBe(false);
      expect(limiter.count).toBe(1);
      limiter.release('a');
      expect(limiter.count).toBe(0);
      expect(limiter.tryAdd('a')).toBe(true);
    });

    it('ignores a release for an IP it does not hold', () => {
      const limiter = new SocketLimiter({ perIp: 1, total: 10 });
      limiter.release('nobody');
      expect(limiter.count).toBe(0);
    });
  });
});
