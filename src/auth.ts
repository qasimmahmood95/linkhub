import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Sessions are stateless: the cookie is `issuedAt.nonce.hmac`, keyed from
 * ADMIN_TOKEN. Rotating the token invalidates every session, and the
 * issued-at timestamp lets the server enforce a maximum age without a store.
 */
export function deriveSessionKey(adminToken: string): Buffer {
  return createHash('sha256').update(`linkhub-session-v1:${adminToken}`).digest();
}

export function signSession(key: Buffer, issuedAtMs: number): string {
  const nonce = randomBytes(12).toString('base64url');
  const payload = `${issuedAtMs}.${nonce}`;
  const mac = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function verifySession(
  key: Buffer,
  cookieValue: string,
  maxAgeMs: number,
  now = Date.now()
): boolean {
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return false;
  const [issuedAtStr, nonce, mac] = parts as [string, string, string];
  const expected = createHmac('sha256', key).update(`${issuedAtStr}.${nonce}`).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;
  if (issuedAt > now + 60_000) return false; // clock skew allowance; reject cookies from the future
  if (now - issuedAt > maxAgeMs) return false;
  return true;
}

/** Constant-time token comparison; hashing first avoids leaking length. */
export function tokenMatches(adminToken: string, presented: string): boolean {
  const a = createHash('sha256').update(adminToken).digest();
  const b = createHash('sha256').update(presented).digest();
  return timingSafeEqual(a, b);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * In-memory fixed-window limiter for login attempts, keyed by direct peer IP.
 * State is per-process and lost on restart, which is acceptable for a
 * single-instance homelab service.
 */
export class LoginRateLimiter {
  private attempts = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  isBlocked(ip: string, now = Date.now()): boolean {
    const entry = this.attempts.get(ip);
    if (!entry) return false;
    if (now - entry.windowStart > this.windowMs) {
      this.attempts.delete(ip);
      return false;
    }
    return entry.count >= this.max;
  }

  recordFailure(ip: string, now = Date.now()): void {
    const entry = this.attempts.get(ip);
    if (!entry || now - entry.windowStart > this.windowMs) {
      this.attempts.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
    }
    if (this.attempts.size > 10_000) {
      for (const [key, value] of this.attempts) {
        if (now - value.windowStart > this.windowMs) this.attempts.delete(key);
      }
    }
  }

  reset(ip: string): void {
    this.attempts.delete(ip);
  }
}
