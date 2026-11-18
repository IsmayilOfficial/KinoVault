import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import path from 'path';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export const SESSION_COOKIE_NAME = 'kv_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const PIN_MAX_FAILURES = 5;
export const PIN_LOCKOUT_MS = 1000 * 60 * 5; // 5 minutes
export const RESET_TOKEN_TTL_MS = 1000 * 60 * 15; // 15 minutes
export const STREAM_TICKET_TTL_SEC = 120; // 2 minutes short-lived stream ticket

// Ephemeral CSPRNG HMAC key per server boot (or configured env secret) for stream tickets
const STREAM_SIGNING_KEY = process.env.STREAM_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

export function hashSecret(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

export function verifySecret(plain: string, stored: string): boolean {
  if (typeof plain !== 'string' || typeof stored !== 'string') {
    return false;
  }
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expectedHex = parts[5];
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || !expectedHex) {
    return false;
  }
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = crypto.scryptSync(plain, salt, expected.length, { N: n, r, p });
    if (actual.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function generateRandomToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Short-lived HMAC-SHA256 stream ticket bound to session + profile + mediaId
export function createSignedStreamTicket(params: {
  sessionId: string;
  profileId: string;
  mediaId: string;
  ttlSeconds?: number;
}): { ticket: string; expiresAt: number } {
  const exp = Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? STREAM_TICKET_TTL_SEC);
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${params.sessionId}.${params.profileId}.${params.mediaId}.${exp}.${nonce}`;
  const sig = crypto.createHmac('sha256', STREAM_SIGNING_KEY).update(payload).digest('hex');
  return {
    ticket: `${exp}.${nonce}.${params.sessionId}.${params.profileId}.${sig}`,
    expiresAt: exp * 1000,
  };
}

export function verifySignedStreamTicket(params: {
  ticket: string;
  mediaId: string;
  expectedSessionId?: string;
  expectedProfileId?: string;
}): { valid: true; sessionId: string; profileId: string } | { valid: false } {
  if (typeof params.ticket !== 'string' || !params.ticket) {
    return { valid: false };
  }
  const parts = params.ticket.split('.');
  if (parts.length !== 5) {
    return { valid: false };
  }
  const [expStr, nonce, sessionId, profileId, sig] = parts;
  const exp = Number.parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { valid: false };
  }
  if (!/^[a-f0-9]{16}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(sig) || !sessionId || !profileId) {
    return { valid: false };
  }
  if (params.expectedSessionId && !timingSafeStringEqual(sessionId, params.expectedSessionId)) {
    return { valid: false };
  }
  if (params.expectedProfileId && !timingSafeStringEqual(profileId, params.expectedProfileId)) {
    return { valid: false };
  }
  const payload = `${sessionId}.${profileId}.${params.mediaId}.${exp}.${nonce}`;
  const expectedSig = crypto.createHmac('sha256', STREAM_SIGNING_KEY).update(payload).digest('hex');
  if (!timingSafeStringEqual(sig, expectedSig)) {
    return { valid: false };
  }
  return { valid: true, sessionId, profileId };
}

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string') return 'Password must be text.';
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/\d/.test(password)) return 'Password must include a number.';
  return null;
}

export function validateEmail(email: string): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length < 5 || normalized.length > 160) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) return null;
  return normalized;
}

export function sanitizeDisplayText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function validatePinFormat(pin: unknown): string | null {
  if (typeof pin !== 'string') return null;
  const trimmed = pin.trim();
  if (!/^\d{4,6}$/.test(trimmed)) return null;
  return trimmed;
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = Object.create(null);
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return cookies;
  }
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const rawKey = pair.slice(0, idx).trim();
    const rawVal = pair.slice(idx + 1).trim();
    if (!rawKey || rawKey === '__proto__' || rawKey === 'constructor' || rawKey === 'prototype') {
      continue;
    }
    try {
      cookies[rawKey] = decodeURIComponent(rawVal);
    } catch {
      cookies[rawKey] = rawVal;
    }
  }
  return cookies;
}

export function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

export function setSessionCookie(res: Response, req: Request, token: string): void {
  const isHttps = isHttpsRequest(req);
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) {
    parts.push('Secure', 'Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response, req: Request): void {
  const isHttps = isHttpsRequest(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) {
    parts.push('Secure', 'Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function resolveSafeMediaPath(mediaRoot: string, filename: string): string | null {
  if (!filename || typeof filename !== 'string') return null;
  if (filename.includes('\0') || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return null;
  }
  const base = path.basename(filename);
  const resolvedRoot = path.resolve(mediaRoot);
  const resolvedFile = path.resolve(resolvedRoot, base);
  if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return resolvedFile;
}

export function getClientIpHash(req: Request): string {
  const rawIp = req.ip || req.socket.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(rawIp).digest('hex').slice(0, 16);
}

interface RateBucket {
  timestamps: number[];
}

export class SlidingRateLimiter {
  private buckets = new Map<string, RateBucket>();

  constructor(private readonly maxAttempts: number, private readonly windowMs: number) {
    const timer = setInterval(() => this.prune(), Math.min(this.windowMs, 60_000));
    timer.unref();
  }

  public check(key: string): { allowed: boolean; retryAfterSec: number; remaining: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const bucket = this.buckets.get(key) ?? { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= this.maxAttempts) {
      const oldest = bucket.timestamps[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.buckets.set(key, bucket);
      return { allowed: false, retryAfterSec, remaining: 0 };
    }

    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, this.maxAttempts - bucket.timestamps.length),
    };
  }

  private prune(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, bucket] of this.buckets.entries()) {
      bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
      if (bucket.timestamps.length === 0) {
        this.buckets.delete(key);
      }
    }
  }
}

export function securityHeadersMiddleware(isProd: boolean) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('X-XSS-Protection', '0');

    const scriptSrc = isProd ? "'self'" : "'self' 'unsafe-inline'";
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self' ws: wss:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ');
    res.setHeader('Content-Security-Policy', csp);
    next();
  };
}

export function stripDangerousKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(stripDangerousKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
        continue;
      }
      clean[k] = stripDangerousKeys(v);
    }
    return clean;
  }
  return obj;
}
