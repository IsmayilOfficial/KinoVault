import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  ALL_GENRES,
  getAnyMediaById,
  getMediaById,
  isRatingAllowed,
  MATURITY_LEVELS,
  MEDIA_CATALOG,
  scoreAndFilterCatalog,
  UPCOMING_CATALOG,
  type MaturityRating,
} from './server/catalog.ts';
import {
  clearSessionCookie,
  createSignedStreamTicket,
  generateRandomToken,
  getClientIpHash,
  hashSecret,
  hashToken,
  parseCookies,
  PIN_LOCKOUT_MS,
  PIN_MAX_FAILURES,
  RESET_TOKEN_TTL_MS,
  resolveSafeMediaPath,
  sanitizeDisplayText,
  securityHeadersMiddleware,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  setSessionCookie,
  SlidingRateLimiter,
  STREAM_TICKET_TTL_SEC,
  stripDangerousKeys,
  timingSafeStringEqual,
  validateEmail,
  validatePasswordStrength,
  validatePinFormat,
  verifySecret,
  verifySignedStreamTicket,
} from './server/security.ts';
import {
  ALLOWED_AVATARS,
  appendAuditLog,
  ensureDemoHousehold,
  loadStore,
  saveStore,
  type AccountRecord,
  type AvatarKey,
  type ProfileRecord,
  type SessionRecord,
} from './server/store.ts';

dotenv.config();

interface AuthContext {
  account: AccountRecord;
  session: SessionRecord;
  activeProfile: ProfileRecord | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const MEDIA_ROOT = path.resolve(process.cwd(), 'server', 'media');

const authRateLimiter = new SlidingRateLimiter(15, 15 * 60 * 1000);
const apiRateLimiter = new SlidingRateLimiter(240, 60 * 1000);

const DUMMY_PASSWORD_HASH = hashSecret('TimingNormalizationDummy!99');

function sanitizeProfile(profile: ProfileRecord) {
  return {
    id: profile.id,
    name: profile.name,
    avatarKey: profile.avatarKey,
    isKids: profile.isKids,
    maxRating: profile.maxRating,
    hasPin: profile.pinHash !== null,
    isPrimary: profile.isPrimary,
    pinLockedUntil: profile.pinLockedUntil > Date.now() ? profile.pinLockedUntil : 0,
  };
}

function summarizeUserAgent(ua: string | undefined): string {
  if (!ua) return 'Browser Session';
  const clean = sanitizeDisplayText(ua, 180);
  const browser = /Edg\//.test(clean)
    ? 'Edge'
    : /Chrome\//.test(clean)
      ? 'Chrome'
      : /Firefox\//.test(clean)
        ? 'Firefox'
        : /Safari\//.test(clean)
          ? 'Safari'
          : 'Web Client';
  const os = /Windows/.test(clean)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(clean)
      ? 'macOS'
      : /Linux/.test(clean)
        ? 'Linux'
        : /Android/.test(clean)
          ? 'Android'
          : /iPhone|iPad/.test(clean)
            ? 'iOS'
            : 'Desktop';
  return `${browser} on ${os}`;
}

function verifySameOriginForAuth(req: Request): boolean {
  const origin = req.headers.origin;
  const forwardedHost = typeof req.headers['x-forwarded-host'] === 'string' ? req.headers['x-forwarded-host'].split(',')[0].trim() : '';
  const host = forwardedHost || req.headers.host;
  if (!origin || !host) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === host;
  } catch {
    return false;
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeadersMiddleware(IS_PROD));
  app.use(express.json({ limit: '32kb' }));

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
      req.body = stripDangerousKeys(req.body);
    }
    next();
  });

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const ipHash = getClientIpHash(req);
    const limit = apiRateLimiter.check(`api:${ipHash}`);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      res.status(429).json({ error: 'Too many requests. Please slow down.' });
      return;
    }
    next();
  });

  app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
    const cookies = parseCookies(req.headers.cookie);
    const authHeader = req.headers.authorization;
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';
    const rawToken = cookies[SESSION_COOKIE_NAME] || bearerToken;
    if (!rawToken) {
      next();
      return;
    }

    const tokenHash = hashToken(rawToken);
    const store = loadStore();
    const now = Date.now();
    const session = store.sessions.find((s) => s.tokenHash === tokenHash && s.expiresAt > now);
    if (!session) {
      next();
      return;
    }

    const account = store.accounts.find((a) => a.id === session.accountId);
    if (!account) {
      next();
      return;
    }

    let activeProfile: ProfileRecord | null = null;
    if (session.activeProfileId) {
      const found = store.profiles.find((p) => p.id === session.activeProfileId && p.accountId === account.id);
      if (found) {
        if (found.pinHash === null || session.pinUnlockedProfileIds.includes(found.id)) {
          activeProfile = found;
        }
      }
    }

    if (now - session.lastSeenAt > 60_000) {
      session.lastSeenAt = now;
      saveStore(store);
    }

    req.auth = { account, session, activeProfile };
    next();
  });

  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    next();
  }

  function requireCsrf(req: Request, res: Response, next: NextFunction): void {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const headerToken = req.headers['x-csrf-token'];
    if (typeof headerToken !== 'string' || !timingSafeStringEqual(headerToken, req.auth.session.csrfToken)) {
      res.status(403).json({ error: 'Invalid or missing CSRF token.' });
      return;
    }
    next();
  }

  function requireActiveProfile(req: Request, res: Response, next: NextFunction): void {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!req.auth.activeProfile) {
      res.status(403).json({ error: 'Select a profile first.' });
      return;
    }
    next();
  }

  function createSessionForAccount(
    req: Request,
    res: Response,
    accountId: string,
    activeProfileId: string | null
  ): { session: SessionRecord; rawToken: string } {
    const store = loadStore();
    const now = Date.now();
    store.sessions = store.sessions.filter((s) => s.expiresAt > now);

    const rawToken = generateRandomToken(32);
    const csrfToken = generateRandomToken(32);
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      tokenHash: hashToken(rawToken),
      accountId,
      activeProfileId,
      pinUnlockedProfileIds: [],
      csrfToken,
      userAgent: summarizeUserAgent(req.headers['user-agent']),
      ipHash: getClientIpHash(req),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastSeenAt: now,
    };

    store.sessions.push(session);
    saveStore(store);
    setSessionCookie(res, req, rawToken);
    return { session, rawToken };
  }

  function buildAuthPayload(account: AccountRecord, session: SessionRecord, rawSessionToken?: string) {
    const store = loadStore();
    const profiles = store.profiles
      .filter((p) => p.accountId === account.id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(sanitizeProfile);

    const activeProfile = session.activeProfileId
      ? profiles.find((p) => p.id === session.activeProfileId && (!p.hasPin || session.pinUnlockedProfileIds.includes(p.id))) ?? null
      : null;

    return {
      authenticated: true,
      csrfToken: session.csrfToken,
      ...(rawSessionToken ? { sessionToken: rawSessionToken } : {}),
      sessionWatermarkId: session.id.slice(0, 8).toUpperCase(),
      account: {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        isDemo: account.isDemo,
      },
      profiles,
      activeProfile,
    };
  }

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    if (!req.auth) {
      res.json({ authenticated: false });
      return;
    }
    res.json(buildAuthPayload(req.auth.account, req.auth.session));
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    if (!verifySameOriginForAuth(req)) {
      res.status(403).json({ error: 'Cross-origin request rejected.' });
      return;
    }

    const ipHash = getClientIpHash(req);
    const rate = authRateLimiter.check(`register:${ipHash}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: `Too many registration attempts. Retry in ${rate.retryAfterSec}s.` });
      return;
    }

    const email = validateEmail(req.body?.email);
    const displayName = sanitizeDisplayText(req.body?.displayName, 40);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (displayName.length < 2) {
      res.status(400).json({ error: 'Household name must be at least 2 characters.' });
      return;
    }
    const pwdError = validatePasswordStrength(password);
    if (pwdError) {
      res.status(400).json({ error: pwdError });
      return;
    }

    const store = loadStore();
    if (store.accounts.some((a) => a.email === email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const now = Date.now();
    const accountId = crypto.randomUUID();
    const account: AccountRecord = {
      id: accountId,
      email,
      displayName,
      passwordHash: hashSecret(password),
      isDemo: false,
      createdAt: now,
    };

    const primaryProfile: ProfileRecord = {
      id: crypto.randomUUID(),
      accountId,
      name: displayName.split(' ')[0] || 'Owner',
      avatarKey: 'crimson',
      isKids: false,
      maxRating: 'R',
      pinHash: null,
      failedPinAttempts: 0,
      pinLockedUntil: 0,
      isPrimary: true,
      createdAt: now,
    };

    const kidsProfile: ProfileRecord = {
      id: crypto.randomUUID(),
      accountId,
      name: 'Kids',
      avatarKey: 'amber',
      isKids: true,
      maxRating: 'PG',
      pinHash: null,
      failedPinAttempts: 0,
      pinLockedUntil: 0,
      isPrimary: false,
      createdAt: now + 1,
    };

    store.accounts.push(account);
    store.profiles.push(primaryProfile, kidsProfile);
    appendAuditLog(store, accountId, 'ACCOUNT_REGISTERED', `Household created for ${email}.`);
    saveStore(store);

    const { session, rawToken } = createSessionForAccount(req, res, accountId, null);
    res.status(201).json(buildAuthPayload(account, session, rawToken));
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    if (!verifySameOriginForAuth(req)) {
      res.status(403).json({ error: 'Cross-origin request rejected.' });
      return;
    }

    const email = validateEmail(req.body?.email) ?? '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const ipHash = getClientIpHash(req);
    const rate = authRateLimiter.check(`login:${ipHash}:${email || 'anon'}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: `Too many sign-in attempts. Retry in ${rate.retryAfterSec}s.` });
      return;
    }

    if (!email || !password || password.length > 128) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const store = loadStore();
    const account = store.accounts.find((a) => a.email === email && !a.isDemo);
    const valid = account
      ? verifySecret(password, account.passwordHash)
      : verifySecret(password, DUMMY_PASSWORD_HASH) && false;

    if (!account || !valid) {
      if (account) {
        appendAuditLog(store, account.id, 'LOGIN_FAILED', 'Incorrect password attempt.');
        saveStore(store);
      }
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    appendAuditLog(store, account.id, 'SIGN_IN', `Signed in from ${summarizeUserAgent(req.headers['user-agent'])}.`);
    saveStore(store);

    const { session, rawToken } = createSessionForAccount(req, res, account.id, null);
    res.json(buildAuthPayload(account, session, rawToken));
  });

  // Password Reset Request (single-use CSPRNG token stored SHA-256 hashed, 15m TTL)
  app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
    if (!verifySameOriginForAuth(req)) {
      res.status(403).json({ error: 'Cross-origin request rejected.' });
      return;
    }

    const ipHash = getClientIpHash(req);
    const rate = authRateLimiter.check(`forgot:${ipHash}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: `Too many reset requests. Retry in ${rate.retryAfterSec}s.` });
      return;
    }

    const email = validateEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const store = loadStore();
    const now = Date.now();
    store.passwordResets = store.passwordResets.filter((r) => r.expiresAt > now && r.usedAt === null);

    const account = store.accounts.find((a) => a.email === email && !a.isDemo);
    let devPreviewToken: string | undefined;

    if (account) {
      // Invalidate any prior unused reset tokens for this account
      store.passwordResets = store.passwordResets.filter((r) => r.accountId !== account.id);
      const rawResetToken = generateRandomToken(24);
      store.passwordResets.push({
        id: crypto.randomUUID(),
        accountId: account.id,
        tokenHash: hashToken(rawResetToken),
        expiresAt: now + RESET_TOKEN_TTL_MS,
        usedAt: null,
        createdAt: now,
      });
      appendAuditLog(store, account.id, 'PASSWORD_RESET_REQUESTED', 'Single-use password reset token issued (15m TTL).');
      saveStore(store);

      // Security: Never expose reset tokens in production HTTP responses; in local preview without SMTP, expose only in dev mode
      if (!IS_PROD) {
        devPreviewToken = rawResetToken;
      }
    }

    res.json({
      ok: true,
      message: 'If an account matches that email, a single-use reset token has been generated (expires in 15 minutes).',
      ...(devPreviewToken ? { devPreviewToken } : {}),
    });
  });

  // Complete Password Reset
  app.post('/api/auth/reset-password', (req: Request, res: Response) => {
    if (!verifySameOriginForAuth(req)) {
      res.status(403).json({ error: 'Cross-origin request rejected.' });
      return;
    }

    const ipHash = getClientIpHash(req);
    const rate = authRateLimiter.check(`reset:${ipHash}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: `Too many reset attempts. Retry in ${rate.retryAfterSec}s.` });
      return;
    }

    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!/^[a-f0-9]{48}$/i.test(token)) {
      res.status(400).json({ error: 'Invalid or malformed reset token.' });
      return;
    }

    const pwdError = validatePasswordStrength(newPassword);
    if (pwdError) {
      res.status(400).json({ error: pwdError });
      return;
    }

    const store = loadStore();
    const now = Date.now();
    const tokenHash = hashToken(token);
    const record = store.passwordResets.find(
      (r) => timingSafeStringEqual(r.tokenHash, tokenHash) && r.usedAt === null && r.expiresAt > now
    );

    if (!record) {
      res.status(400).json({ error: 'Reset token is invalid or has expired.' });
      return;
    }

    const account = store.accounts.find((a) => a.id === record.accountId && !a.isDemo);
    if (!account) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    record.usedAt = now;
    account.passwordHash = hashSecret(newPassword);
    // Revoke all active sessions for security on password reset
    store.sessions = store.sessions.filter((s) => s.accountId !== account.id);
    appendAuditLog(store, account.id, 'PASSWORD_RESET_COMPLETED', 'Password updated via reset token; all sessions revoked.');
    saveStore(store);

    res.json({ ok: true, message: 'Password updated. You can now sign in with your new password.' });
  });

  app.post('/api/auth/demo', (req: Request, res: Response) => {
    if (!verifySameOriginForAuth(req)) {
      res.status(403).json({ error: 'Cross-origin request rejected.' });
      return;
    }

    const ipHash = getClientIpHash(req);
    const rate = authRateLimiter.check(`demo:${ipHash}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: `Please wait ${rate.retryAfterSec}s before starting another demo session.` });
      return;
    }

    const store = loadStore();
    const demoAccount = ensureDemoHousehold(store);
    appendAuditLog(store, demoAccount.id, 'DEMO_SESSION', 'Demo household session started.');
    saveStore(store);

    const { session, rawToken } = createSessionForAccount(req, res, demoAccount.id, null);
    res.json(buildAuthPayload(demoAccount, session, rawToken));
  });

  app.post('/api/auth/logout', requireAuth, requireCsrf, (req: Request, res: Response) => {
    const store = loadStore();
    const { account, session } = req.auth!;
    store.sessions = store.sessions.filter((s) => s.id !== session.id);
    appendAuditLog(store, account.id, 'SIGN_OUT', 'Session terminated by user.');
    saveStore(store);
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  app.post('/api/profiles/:id/select', requireAuth, requireCsrf, (req: Request, res: Response) => {
    const profileId = req.params.id;
    const store = loadStore();
    const { account, session } = req.auth!;

    const profile = store.profiles.find((p) => p.id === profileId && p.accountId === account.id);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    const dbSession = store.sessions.find((s) => s.id === session.id);
    if (!dbSession) {
      res.status(401).json({ error: 'Session expired.' });
      return;
    }

    const now = Date.now();
    if (profile.pinHash !== null && !dbSession.pinUnlockedProfileIds.includes(profile.id)) {
      if (profile.pinLockedUntil > now) {
        const lockedSeconds = Math.ceil((profile.pinLockedUntil - now) / 1000);
        res.status(429).json({
          error: `PIN locked after repeated failed attempts. Try again in ${lockedSeconds}s.`,
          pinRequired: true,
          lockedSeconds,
        });
        return;
      }

      const pin = validatePinFormat(req.body?.pin);
      if (!pin) {
        res.status(403).json({
          error: 'Profile PIN is required (4–6 digits).',
          pinRequired: true,
        });
        return;
      }

      const validPin = verifySecret(pin, profile.pinHash);
      if (!validPin) {
        profile.failedPinAttempts += 1;
        if (profile.failedPinAttempts >= PIN_MAX_FAILURES) {
          profile.pinLockedUntil = now + PIN_LOCKOUT_MS;
          profile.failedPinAttempts = 0;
          appendAuditLog(store, account.id, 'PIN_LOCKOUT', `Profile "${profile.name}" locked for 5m after failed PIN attempts.`);
          saveStore(store);
          res.status(429).json({
            error: 'Too many incorrect PIN attempts. Profile locked for 5 minutes.',
            pinRequired: true,
            lockedSeconds: Math.ceil(PIN_LOCKOUT_MS / 1000),
          });
          return;
        }
        const attemptsRemaining = PIN_MAX_FAILURES - profile.failedPinAttempts;
        appendAuditLog(store, account.id, 'PIN_FAILED', `Incorrect PIN for profile "${profile.name}".`);
        saveStore(store);
        res.status(403).json({
          error: `Incorrect PIN. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`,
          pinRequired: true,
          attemptsRemaining,
        });
        return;
      }

      profile.failedPinAttempts = 0;
      profile.pinLockedUntil = 0;
      dbSession.pinUnlockedProfileIds.push(profile.id);
      appendAuditLog(store, account.id, 'PIN_UNLOCKED', `Profile "${profile.name}" unlocked via PIN.`);
    }

    dbSession.activeProfileId = profile.id;
    saveStore(store);

    res.json({
      activeProfile: sanitizeProfile(profile),
    });
  });

  app.post('/api/profiles/lock', requireAuth, requireCsrf, (req: Request, res: Response) => {
    const store = loadStore();
    const dbSession = store.sessions.find((s) => s.id === req.auth!.session.id);
    if (dbSession) {
      dbSession.activeProfileId = null;
      dbSession.pinUnlockedProfileIds = [];
      saveStore(store);
    }
    res.json({ ok: true });
  });

  // Update active viewer's own basic profile info (name, avatarKey, and displayName if primary)
  app.patch('/api/account/profile', requireActiveProfile, requireCsrf, (req: Request, res: Response) => {
    const { account, activeProfile } = req.auth!;
    const store = loadStore();
    const dbProfile = store.profiles.find((p) => p.id === activeProfile!.id && p.accountId === account.id);
    const dbAccount = store.accounts.find((a) => a.id === account.id);
    if (!dbProfile || !dbAccount) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    if (req.body?.name !== undefined) {
      const cleanName = sanitizeDisplayText(req.body.name, 24);
      if (cleanName.length < 1) {
        res.status(400).json({ error: 'Profile name cannot be empty.' });
        return;
      }
      dbProfile.name = cleanName;
    }

    if (req.body?.avatarKey !== undefined && ALLOWED_AVATARS.includes(req.body.avatarKey)) {
      dbProfile.avatarKey = req.body.avatarKey;
    }

    if (req.body?.displayName !== undefined && dbProfile.isPrimary) {
      const cleanHousehold = sanitizeDisplayText(req.body.displayName, 40);
      if (cleanHousehold.length < 2) {
        res.status(400).json({ error: 'Household name must be at least 2 characters.' });
        return;
      }
      dbAccount.displayName = cleanHousehold;
    }

    saveStore(store);
    res.json({
      activeProfile: sanitizeProfile(dbProfile),
      account: {
        id: dbAccount.id,
        email: dbAccount.email,
        displayName: dbAccount.displayName,
        isDemo: dbAccount.isDemo,
      },
    });
  });

  app.post('/api/profiles', requireAuth, requireCsrf, (req: Request, res: Response) => {
    const { account, activeProfile } = req.auth!;
    if (activeProfile?.isKids) {
      res.status(403).json({ error: 'Kids profiles cannot manage household profiles.' });
      return;
    }

    const store = loadStore();
    const existing = store.profiles.filter((p) => p.accountId === account.id);
    if (existing.length >= 6) {
      res.status(400).json({ error: 'Maximum of 6 profiles per household reached.' });
      return;
    }

    const name = sanitizeDisplayText(req.body?.name, 24);
    if (name.length < 1) {
      res.status(400).json({ error: 'Profile name is required.' });
      return;
    }

    const rawAvatar = req.body?.avatarKey;
    const avatarKey: AvatarKey = ALLOWED_AVATARS.includes(rawAvatar) ? rawAvatar : 'silver';
    const isKids = Boolean(req.body?.isKids);

    const requestedRating = req.body?.maxRating as MaturityRating;
    const maxRating: MaturityRating = isKids
      ? 'PG'
      : Object.prototype.hasOwnProperty.call(MATURITY_LEVELS, requestedRating)
        ? requestedRating
        : 'R';

    let pinHash: string | null = null;
    if (req.body?.pin !== undefined && req.body?.pin !== null && String(req.body.pin).trim() !== '') {
      if (isKids) {
        res.status(400).json({ error: 'Kids profiles do not require a PIN lock.' });
        return;
      }
      const validPin = validatePinFormat(req.body.pin);
      if (!validPin) {
        res.status(400).json({ error: 'Profile PIN must be 4 to 6 digits.' });
        return;
      }
      pinHash = hashSecret(validPin);
    }

    const newProfile: ProfileRecord = {
      id: crypto.randomUUID(),
      accountId: account.id,
      name,
      avatarKey,
      isKids,
      maxRating,
      pinHash,
      failedPinAttempts: 0,
      pinLockedUntil: 0,
      isPrimary: false,
      createdAt: Date.now(),
    };

    store.profiles.push(newProfile);
    appendAuditLog(store, account.id, 'PROFILE_CREATED', `Created profile "${name}" (max rating ${maxRating}).`);
    saveStore(store);

    res.status(201).json({ profile: sanitizeProfile(newProfile) });
  });

  app.patch('/api/profiles/:id', requireAuth, requireCsrf, (req: Request, res: Response) => {
    const { account, activeProfile, session } = req.auth!;
    if (activeProfile?.isKids) {
      res.status(403).json({ error: 'Kids profiles cannot modify profile settings.' });
      return;
    }

    const store = loadStore();
    const profile = store.profiles.find((p) => p.id === req.params.id && p.accountId === account.id);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    if (profile.pinHash !== null && req.body?.pin !== undefined) {
      const currentPin = validatePinFormat(req.body?.currentPin);
      if (!currentPin || !verifySecret(currentPin, profile.pinHash)) {
        res.status(403).json({ error: 'Current 4–6 digit PIN is required to change or remove the profile lock.' });
        return;
      }
    }

    if (req.body?.name !== undefined) {
      const name = sanitizeDisplayText(req.body.name, 24);
      if (name.length < 1) {
        res.status(400).json({ error: 'Profile name cannot be empty.' });
        return;
      }
      profile.name = name;
    }

    if (req.body?.avatarKey !== undefined && ALLOWED_AVATARS.includes(req.body.avatarKey)) {
      profile.avatarKey = req.body.avatarKey;
    }

    if (req.body?.isKids !== undefined && !profile.isPrimary) {
      profile.isKids = Boolean(req.body.isKids);
      if (profile.isKids) {
        profile.maxRating = 'PG';
      }
    }

    if (req.body?.maxRating !== undefined && !profile.isKids) {
      const r = req.body.maxRating as MaturityRating;
      if (Object.prototype.hasOwnProperty.call(MATURITY_LEVELS, r)) {
        profile.maxRating = r;
      }
    }

    if (req.body?.pin !== undefined) {
      if (req.body.pin === null || String(req.body.pin).trim() === '') {
        profile.pinHash = null;
        profile.failedPinAttempts = 0;
        profile.pinLockedUntil = 0;
        appendAuditLog(store, account.id, 'PIN_REMOVED', `Removed PIN lock from "${profile.name}".`);
      } else {
        const validPin = validatePinFormat(req.body.pin);
        if (!validPin) {
          res.status(400).json({ error: 'PIN must be 4 to 6 digits.' });
          return;
        }
        profile.pinHash = hashSecret(validPin);
        profile.failedPinAttempts = 0;
        profile.pinLockedUntil = 0;
        const dbSession = store.sessions.find((s) => s.id === session.id);
        if (dbSession && !dbSession.pinUnlockedProfileIds.includes(profile.id)) {
          dbSession.pinUnlockedProfileIds.push(profile.id);
        }
        appendAuditLog(store, account.id, 'PIN_UPDATED', `Enabled or updated PIN lock on "${profile.name}".`);
      }
    }

    saveStore(store);
    res.json({ profile: sanitizeProfile(profile) });
  });

  app.delete('/api/profiles/:id', requireAuth, requireCsrf, (req: Request, res: Response) => {
    const { account, activeProfile } = req.auth!;
    if (activeProfile?.isKids) {
      res.status(403).json({ error: 'Kids profiles cannot delete profiles.' });
      return;
    }

    const store = loadStore();
    const profile = store.profiles.find((p) => p.id === req.params.id && p.accountId === account.id);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    if (profile.isPrimary) {
      res.status(400).json({ error: 'Cannot delete the primary household profile.' });
      return;
    }

    store.profiles = store.profiles.filter((p) => p.id !== profile.id);
    store.watchlist = store.watchlist.filter((w) => w.profileId !== profile.id);
    store.favorites = store.favorites.filter((f) => f.profileId !== profile.id);
    store.progress = store.progress.filter((pr) => pr.profileId !== profile.id);
    store.watchHistory = store.watchHistory.filter((h) => h.profileId !== profile.id);
    for (const s of store.sessions) {
      if (s.activeProfileId === profile.id) s.activeProfileId = null;
      s.pinUnlockedProfileIds = s.pinUnlockedProfileIds.filter((id) => id !== profile.id);
    }

    appendAuditLog(store, account.id, 'PROFILE_DELETED', `Deleted profile "${profile.name}".`);
    saveStore(store);
    res.json({ ok: true });
  });

  // Catalog with Movie/Show type, genre, and scored search
  app.get('/api/catalog', requireActiveProfile, (req: Request, res: Response) => {
    const profile = req.auth!.activeProfile!;
    const store = loadStore();

    const genreFilter = typeof req.query.genre === 'string' ? req.query.genre.trim() : 'All Titles';
    const mediaTypeFilter = typeof req.query.type === 'string' ? req.query.type.trim() : 'all';
    const searchQuery = typeof req.query.q === 'string' ? sanitizeDisplayText(req.query.q, 80) : '';

    const watchlistIds = new Set(
      store.watchlist.filter((w) => w.profileId === profile.id).map((w) => w.mediaId)
    );
    const favoriteIds = new Set(
      store.favorites.filter((f) => f.profileId === profile.id).map((f) => f.mediaId)
    );
    const progressMap = new Map(
      store.progress
        .filter((p) => p.profileId === profile.id)
        .map((p) => [p.mediaId, { positionSeconds: p.positionSeconds, durationSeconds: p.durationSeconds, updatedAt: p.updatedAt }])
    );

    const allowedCatalog = MEDIA_CATALOG.filter((item) => isRatingAllowed(item.maturityRating, profile.maxRating));
    const filtered = scoreAndFilterCatalog(allowedCatalog, {
      genre: genreFilter,
      mediaType: mediaTypeFilter,
      query: searchQuery,
    });

    const serializeItem = (item: (typeof MEDIA_CATALOG)[number]) => {
      const prog = progressMap.get(item.id);
      return {
        id: item.id,
        mediaType: item.mediaType,
        seasonsLabel: item.seasonsLabel ?? null,
        title: item.title,
        tagline: item.tagline,
        synopsis: item.synopsis,
        director: item.director,
        cast: item.cast,
        year: item.year,
        durationLabel: item.durationLabel,
        durationSeconds: item.durationSeconds,
        maturityRating: item.maturityRating,
        genres: item.genres,
        quality: item.quality,
        audio: item.audio,
        backdropUrl: item.backdropUrl,
        featured: item.featured,
        trendingRank: item.trendingRank ?? null,
        inWatchlist: watchlistIds.has(item.id),
        isFavorite: favoriteIds.has(item.id),
        progressSeconds: prog?.positionSeconds ?? 0,
        lastWatchedAt: prog?.updatedAt ?? 0,
      };
    };

    res.json({
      genres: ALL_GENRES,
      items: filtered.map(serializeItem),
      totalAllowedCount: allowedCatalog.length,
    });
  });

  // Upcoming releases endpoint filtered by active profile maturity rating
  app.get('/api/catalog/upcoming', requireActiveProfile, (req: Request, res: Response) => {
    const profile = req.auth!.activeProfile!;
    const store = loadStore();

    const watchlistIds = new Set(
      store.watchlist.filter((w) => w.profileId === profile.id).map((w) => w.mediaId)
    );
    const favoriteIds = new Set(
      store.favorites.filter((f) => f.profileId === profile.id).map((f) => f.mediaId)
    );

    const allowedUpcoming = UPCOMING_CATALOG.filter((item) =>
      isRatingAllowed(item.maturityRating, profile.maxRating)
    );

    const items = allowedUpcoming.map((item) => ({
      id: item.id,
      mediaType: item.mediaType,
      seasonsLabel: item.seasonsLabel ?? null,
      title: item.title,
      tagline: item.tagline,
      synopsis: item.synopsis,
      director: item.director,
      cast: item.cast,
      year: item.year,
      durationLabel: item.durationLabel,
      durationSeconds: item.durationSeconds,
      maturityRating: item.maturityRating,
      genres: item.genres,
      quality: item.quality,
      audio: item.audio,
      backdropUrl: item.backdropUrl,
      featured: false,
      trendingRank: null,
      inWatchlist: watchlistIds.has(item.id),
      isFavorite: favoriteIds.has(item.id),
      progressSeconds: 0,
      lastWatchedAt: 0,
      isUpcoming: true,
      releaseDateLabel: item.releaseDateLabel ?? 'Coming Soon',
    }));

    res.json({
      items,
      totalAllowedCount: allowedUpcoming.length,
    });
  });

  // Issue short-lived HMAC-SHA256 signed stream ticket bound to current session + profile + mediaId
  app.post('/api/stream/:id/ticket', requireActiveProfile, requireCsrf, (req: Request, res: Response) => {
    const { session, activeProfile } = req.auth!;
    const media = getMediaById(req.params.id);
    if (!media) {
      res.status(404).json({ error: 'Title not found.' });
      return;
    }
    if (!isRatingAllowed(media.maturityRating, activeProfile!.maxRating)) {
      res.status(403).json({ error: 'This title exceeds the active profile maturity rating.' });
      return;
    }

    const { ticket, expiresAt } = createSignedStreamTicket({
      sessionId: session.id,
      profileId: activeProfile!.id,
      mediaId: media.id,
      ttlSeconds: STREAM_TICKET_TTL_SEC,
    });

    res.json({
      ticket,
      expiresAt,
      streamUrl: `/api/stream/${encodeURIComponent(media.id)}?ticket=${encodeURIComponent(ticket)}`,
      watermark: `${activeProfile!.name.toUpperCase().slice(0, 8)}-${session.id.slice(0, 8).toUpperCase()}`,
    });
  });

  // Hardened HTTP 206 Partial Content Video Streaming Endpoint (Requires Signed Stream Ticket + Live Active Session)
  app.get('/api/stream/:id', (req: Request, res: Response) => {
    const media = getMediaById(req.params.id);
    if (!media) {
      res.status(404).json({ error: 'Title not found.' });
      return;
    }

    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    const verified = verifySignedStreamTicket({
      ticket,
      mediaId: media.id,
      expectedSessionId: req.auth?.session.id,
      expectedProfileId: req.auth?.activeProfile?.id,
    });
    if (!verified.valid) {
      res.status(403).json({ error: 'Invalid or expired stream license ticket.' });
      return;
    }

    const store = loadStore();
    const now = Date.now();
    const session = store.sessions.find((s) => s.id === verified.sessionId && s.expiresAt > now);
    if (!session || session.activeProfileId !== verified.profileId) {
      res.status(401).json({ error: 'Active session required to stream.' });
      return;
    }

    const profile = store.profiles.find((p) => p.id === verified.profileId && p.accountId === session.accountId);
    if (!profile) {
      res.status(403).json({ error: 'Profile not authorized.' });
      return;
    }
    if (profile.pinHash !== null && !session.pinUnlockedProfileIds.includes(profile.id)) {
      res.status(403).json({ error: 'Profile PIN unlock required.' });
      return;
    }
    if (!isRatingAllowed(media.maturityRating, profile.maxRating)) {
      res.status(403).json({ error: 'This title exceeds the active profile maturity rating.' });
      return;
    }

    const filePath = media.mediaFilename ? resolveSafeMediaPath(MEDIA_ROOT, media.mediaFilename) : null;
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Media stream unavailable.' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const rangeHeader = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store, no-transform');

    if (!rangeHeader) {
      res.setHeader('Content-Length', String(fileSize));
      res.status(200);
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      res.status(416).end();
      return;
    }

    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Math.min(Number.parseInt(match[2], 10), fileSize - 1) : Math.min(start + 1024 * 1024 - 1, fileSize - 1);

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= fileSize || end < start) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      res.status(416).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', String(chunkSize));

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    stream.pipe(res);
  });

  app.post('/api/watchlist/:mediaId', requireActiveProfile, requireCsrf, (req: Request, res: Response) => {
    const profile = req.auth!.activeProfile!;
    const media = getAnyMediaById(req.params.mediaId);
    if (!media) {
      res.status(404).json({ error: 'Title not found.' });
      return;
    }
    if (!isRatingAllowed(media.maturityRating, profile.maxRating)) {
      res.status(403).json({ error: 'Title restricted for this profile.' });
      return;
    }

    const store = loadStore();
    const existingIdx = store.watchlist.findIndex((w) => w.profileId === profile.id && w.mediaId === media.id);
    let inWatchlist = false;
    if (existingIdx >= 0) {
      store.watchlist.splice(existingIdx, 1);
      inWatchlist = false;
    } else {
      store.watchlist.push({ profileId: profile.id, mediaId: media.id, addedAt: Date.now() });
      inWatchlist = true;
    }
    saveStore(store);
    res.json({ mediaId: media.id, inWatchlist });
  });

  app.post('/api/favorites/:mediaId', requireActiveProfile, requireCsrf, (req: Request, res: Response) => {
    const profile = req.auth!.activeProfile!;
    const media = getAnyMediaById(req.params.mediaId);
    if (!media) {
      res.status(404).json({ error: 'Title not found.' });
      return;
    }
    if (!isRatingAllowed(media.maturityRating, profile.maxRating)) {
      res.status(403).json({ error: 'Title restricted for this profile.' });
      return;
    }

    const store = loadStore();
    const existingIdx = store.favorites.findIndex((f) => f.profileId === profile.id && f.mediaId === media.id);
    let isFavorite = false;
    if (existingIdx >= 0) {
      store.favorites.splice(existingIdx, 1);
      isFavorite = false;
    } else {
      store.favorites.push({ profileId: profile.id, mediaId: media.id, favoritedAt: Date.now() });
      isFavorite = true;
    }
    saveStore(store);
    res.json({ mediaId: media.id, isFavorite });
  });

  app.put('/api/progress/:mediaId', requireActiveProfile, requireCsrf, (req: Request, res: Response) => {
    const profile = req.auth!.activeProfile!;
    const media = getMediaById(req.params.mediaId);
    if (!media) {
      res.status(404).json({ error: 'Title not found.' });
      return;
    }
    if (!isRatingAllowed(media.maturityRating, profile.maxRating)) {
      res.status(403).json({ error: 'Title restricted for this profile.' });
      return;
    }

    const rawPos = Number(req.body?.positionSeconds);
    if (!Number.isFinite(rawPos) || rawPos < 0) {
      res.status(400).json({ error: 'Invalid playback position.' });
      return;
    }

    const clamped = Math.min(Math.round(rawPos), media.durationSeconds);
    const completed = clamped >= media.durationSeconds - 1;
    const now = Date.now();
    const store = loadStore();

    const existing = store.progress.find((p) => p.profileId === profile.id && p.mediaId === media.id);
    if (existing) {
      existing.positionSeconds = completed ? 0 : clamped;
      existing.durationSeconds = media.durationSeconds;
      existing.updatedAt = now;
    } else {
      store.progress.push({
        profileId: profile.id,
        mediaId: media.id,
        positionSeconds: completed ? 0 : clamped,
        durationSeconds: media.durationSeconds,
        updatedAt: now,
      });
    }

    // Record persistent Watch History entry
    const hist = store.watchHistory.find((h) => h.profileId === profile.id && h.mediaId === media.id);
    if (hist) {
      hist.lastPositionSeconds = clamped;
      hist.durationSeconds = media.durationSeconds;
      hist.completed = completed || hist.completed;
      hist.watchedAt = now;
    } else {
      store.watchHistory.push({
        profileId: profile.id,
        mediaId: media.id,
        lastPositionSeconds: clamped,
        durationSeconds: media.durationSeconds,
        completed,
        watchedAt: now,
      });
    }

    saveStore(store);
    res.json({ mediaId: media.id, positionSeconds: completed ? 0 : clamped });
  });

  // Watch History endpoints scoped strictly to active profile
  app.get('/api/history', requireActiveProfile, (req: Request, res: Response) => {
    const profile = req.auth!.activeProfile!;
    const store = loadStore();

    const entries = store.watchHistory
      .filter((h) => h.profileId === profile.id)
      .sort((a, b) => b.watchedAt - a.watchedAt)
      .map((h) => {
        const media = getMediaById(h.mediaId);
        if (!media || !isRatingAllowed(media.maturityRating, profile.maxRating)) return null;
        return {
          mediaId: media.id,
          title: media.title,
          mediaType: media.mediaType,
          year: media.year,
          durationLabel: media.durationLabel,
          maturityRating: media.maturityRating,
          backdropUrl: media.backdropUrl,
          lastPositionSeconds: h.lastPositionSeconds,
          durationSeconds: h.durationSeconds,
          completed: h.completed,
          watchedAt: h.watchedAt,
        };
      })
      .filter(Boolean);

    res.json({ history: entries });
  });

  app.delete('/api/history/:mediaId', requireActiveProfile, requireCsrf, (req: Request, res: Response) => {
    const profile = req.auth!.activeProfile!;
    const store = loadStore();
    store.watchHistory = store.watchHistory.filter(
      (h) => !(h.profileId === profile.id && h.mediaId === req.params.mediaId)
    );
    store.progress = store.progress.filter(
      (p) => !(p.profileId === profile.id && p.mediaId === req.params.mediaId)
    );
    saveStore(store);
    res.json({ ok: true });
  });

  app.delete('/api/history', requireActiveProfile, requireCsrf, (req: Request, res: Response) => {
    const profile = req.auth!.activeProfile!;
    const store = loadStore();
    store.watchHistory = store.watchHistory.filter((h) => h.profileId !== profile.id);
    store.progress = store.progress.filter((p) => p.profileId !== profile.id);
    saveStore(store);
    res.json({ ok: true });
  });

  app.get('/api/security/overview', requireAuth, (req: Request, res: Response) => {
    const { account, session, activeProfile } = req.auth!;
    if (activeProfile?.isKids) {
      res.status(403).json({ error: 'Security controls are restricted for Kids profiles.' });
      return;
    }

    const store = loadStore();
    const now = Date.now();
    const sessions = store.sessions
      .filter((s) => s.accountId === account.id && s.expiresAt > now)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((s) => ({
        id: s.id,
        isCurrent: s.id === session.id,
        device: s.userAgent,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
      }));

    const auditLogs = store.auditLogs
      .filter((l) => l.accountId === account.id)
      .slice(0, 20);

    res.json({
      sessions,
      auditLogs,
      controls: {
        passwordKdf: 'scrypt (N=16384, r=8, p=1, 64-byte key)',
        sessionCookie: 'HttpOnly + SHA-256 Server Hash + 256-bit CSPRNG',
        csrfProtection: 'Per-Session Timing-Safe Synchronizer Token',
        streamGuard: 'HMAC-SHA256 120s Signed Stream Ticket + HTTP 206 Path Guard',
        maturityGuard: 'Server-Enforced Profile Rating Gate',
        pinBruteForceLockout: `${PIN_MAX_FAILURES} attempts / 5m lockout`,
      },
    });
  });

  app.delete('/api/security/sessions/:sessionId', requireAuth, requireCsrf, (req: Request, res: Response) => {
    const { account, session, activeProfile } = req.auth!;
    if (activeProfile?.isKids) {
      res.status(403).json({ error: 'Kids profiles cannot revoke sessions.' });
      return;
    }

    if (req.params.sessionId === session.id) {
      res.status(400).json({ error: 'Use Sign Out to end your current session.' });
      return;
    }

    const store = loadStore();
    const target = store.sessions.find((s) => s.id === req.params.sessionId && s.accountId === account.id);
    if (!target) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    store.sessions = store.sessions.filter((s) => s.id !== target.id);
    appendAuditLog(store, account.id, 'SESSION_REVOKED', `Revoked session (${target.userAgent}).`);
    saveStore(store);

    res.json({ ok: true });
  });

  app.post('/api/security/password', requireAuth, requireCsrf, (req: Request, res: Response) => {
    const { account, session, activeProfile } = req.auth!;
    if (activeProfile?.isKids) {
      res.status(403).json({ error: 'Kids profiles cannot change account credentials.' });
      return;
    }
    if (account.isDemo) {
      res.status(400).json({ error: 'Demo household password cannot be changed. Create a personal account to customize credentials.' });
      return;
    }

    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!verifySecret(currentPassword, account.passwordHash)) {
      res.status(403).json({ error: 'Current password is incorrect.' });
      return;
    }

    const pwdError = validatePasswordStrength(newPassword);
    if (pwdError) {
      res.status(400).json({ error: pwdError });
      return;
    }

    const store = loadStore();
    const dbAccount = store.accounts.find((a) => a.id === account.id);
    if (!dbAccount) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    dbAccount.passwordHash = hashSecret(newPassword);
    const newCsrf = generateRandomToken(32);
    store.sessions = store.sessions.filter((s) => s.accountId !== account.id || s.id === session.id);
    const dbSession = store.sessions.find((s) => s.id === session.id);
    if (dbSession) {
      dbSession.csrfToken = newCsrf;
    }

    appendAuditLog(store, account.id, 'PASSWORD_CHANGED', 'Password updated; other active sessions revoked.');
    saveStore(store);

    res.json({ ok: true, csrfToken: newCsrf });
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found.' });
  });

  const httpServer = http.createServer(app);

  if (!IS_PROD) {
    const vite = await createViteServer({
      plugins: [
        {
          name: 'kinovault-disable-hmr-ws',
          enforce: 'post',
          transform(code, id) {
            if (id.replace(/\\/g, '/').endsWith('/vite/dist/client/client.mjs')) {
              return {
                code: code.replace(
                  'transport.connect(createHMRHandler(handleMessage));',
                  '/* HMR WebSocket transport disabled in preview */'
                ),
                map: null,
              };
            }
          },
        },
      ],
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`KinoVault server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start KinoVault server:', err);
  process.exit(1);
});
