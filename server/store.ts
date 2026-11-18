import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { MaturityRating } from './catalog.ts';
import { generateRandomToken, hashSecret } from './security.ts';

export type AvatarKey = 'crimson' | 'obsidian' | 'cobalt' | 'amber' | 'emerald' | 'silver';

export const ALLOWED_AVATARS: AvatarKey[] = ['crimson', 'obsidian', 'cobalt', 'amber', 'emerald', 'silver'];

export interface AccountRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  isDemo: boolean;
  createdAt: number;
}

export interface ProfileRecord {
  id: string;
  accountId: string;
  name: string;
  avatarKey: AvatarKey;
  isKids: boolean;
  maxRating: MaturityRating;
  pinHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: number;
  isPrimary: boolean;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  accountId: string;
  activeProfileId: string | null;
  pinUnlockedProfileIds: string[];
  csrfToken: string;
  userAgent: string;
  ipHash: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
}

export interface PasswordResetRecord {
  id: string;
  accountId: string;
  tokenHash: string;
  expiresAt: number;
  usedAt: number | null;
  createdAt: number;
}

export interface WatchlistRecord {
  profileId: string;
  mediaId: string;
  addedAt: number;
}

export interface FavoriteRecord {
  profileId: string;
  mediaId: string;
  favoritedAt: number;
}

export interface ProgressRecord {
  profileId: string;
  mediaId: string;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: number;
}

export interface WatchHistoryRecord {
  profileId: string;
  mediaId: string;
  lastPositionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  watchedAt: number;
}

export interface SecurityAuditRecord {
  id: string;
  accountId: string;
  event: string;
  detail: string;
  timestamp: number;
}

export interface StoreSchema {
  accounts: AccountRecord[];
  profiles: ProfileRecord[];
  sessions: SessionRecord[];
  passwordResets: PasswordResetRecord[];
  watchlist: WatchlistRecord[];
  favorites: FavoriteRecord[];
  progress: ProgressRecord[];
  watchHistory: WatchHistoryRecord[];
  auditLogs: SecurityAuditRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const EMPTY_STORE: StoreSchema = {
  accounts: [],
  profiles: [],
  sessions: [],
  passwordResets: [],
  watchlist: [],
  favorites: [],
  progress: [],
  watchHistory: [],
  auditLogs: [],
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadStore(): StoreSchema {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    saveStore(EMPTY_STORE);
    return structuredClone(EMPTY_STORE);
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreSchema>;
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      passwordResets: Array.isArray(parsed.passwordResets) ? parsed.passwordResets : [],
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      progress: Array.isArray(parsed.progress) ? parsed.progress : [],
      watchHistory: Array.isArray(parsed.watchHistory) ? parsed.watchHistory : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };
  } catch {
    return structuredClone(EMPTY_STORE);
  }
}

export function saveStore(store: StoreSchema): void {
  ensureDataDir();
  const tmpPath = `${STORE_PATH}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, STORE_PATH);
}

export function appendAuditLog(store: StoreSchema, accountId: string, event: string, detail: string): void {
  store.auditLogs.unshift({
    id: crypto.randomUUID(),
    accountId,
    event,
    detail,
    timestamp: Date.now(),
  });
  const accountLogs: SecurityAuditRecord[] = [];
  const otherLogs: SecurityAuditRecord[] = [];
  for (const entry of store.auditLogs) {
    if (entry.accountId === accountId) {
      if (accountLogs.length < 60) accountLogs.push(entry);
    } else {
      otherLogs.push(entry);
    }
  }
  store.auditLogs = [...accountLogs, ...otherLogs].sort((a, b) => b.timestamp - a.timestamp);
}

export function ensureDemoHousehold(store: StoreSchema): AccountRecord {
  const existing = store.accounts.find((a) => a.email === 'household@kinovault.local' && a.isDemo);
  if (existing) {
    if (store.watchHistory.length === 0) {
      const primary = store.profiles.find((p) => p.accountId === existing.id && p.isPrimary);
      if (primary) {
        const now = Date.now();
        store.watchHistory.push(
          {
            profileId: primary.id,
            mediaId: 'meridian-nine',
            lastPositionSeconds: 9,
            durationSeconds: 24,
            completed: false,
            watchedAt: now - 3600_000,
          },
          {
            profileId: primary.id,
            mediaId: 'velvet-alibi',
            lastPositionSeconds: 14,
            durationSeconds: 24,
            completed: false,
            watchedAt: now - 7200_000,
          },
          {
            profileId: primary.id,
            mediaId: 'svalbard-echoes',
            lastPositionSeconds: 24,
            durationSeconds: 24,
            completed: true,
            watchedAt: now - 86400_000,
          }
        );
        saveStore(store);
      }
    }
    return existing;
  }

  const now = Date.now();
  const accountId = crypto.randomUUID();
  const randomPassword = generateRandomToken(24) + 'Aa1';
  const account: AccountRecord = {
    id: accountId,
    email: 'household@kinovault.local',
    displayName: 'KinoVault Household',
    passwordHash: hashSecret(randomPassword),
    isDemo: true,
    createdAt: now,
  };
  store.accounts.push(account);

  const primaryProfileId = crypto.randomUUID();
  const guestProfileId = crypto.randomUUID();
  const kidsProfileId = crypto.randomUUID();
  const vaultProfileId = crypto.randomUUID();

  store.profiles.push(
    {
      id: primaryProfileId,
      accountId,
      name: 'Alex',
      avatarKey: 'crimson',
      isKids: false,
      maxRating: 'R',
      pinHash: null,
      failedPinAttempts: 0,
      pinLockedUntil: 0,
      isPrimary: true,
      createdAt: now,
    },
    {
      id: guestProfileId,
      accountId,
      name: 'Guest',
      avatarKey: 'cobalt',
      isKids: false,
      maxRating: 'PG-13',
      pinHash: null,
      failedPinAttempts: 0,
      pinLockedUntil: 0,
      isPrimary: false,
      createdAt: now + 1,
    },
    {
      id: kidsProfileId,
      accountId,
      name: 'Kids',
      avatarKey: 'amber',
      isKids: true,
      maxRating: 'PG',
      pinHash: null,
      failedPinAttempts: 0,
      pinLockedUntil: 0,
      isPrimary: false,
      createdAt: now + 2,
    },
    {
      id: vaultProfileId,
      accountId,
      name: 'Private Vault',
      avatarKey: 'obsidian',
      isKids: false,
      maxRating: 'R',
      pinHash: hashSecret('1984'),
      failedPinAttempts: 0,
      pinLockedUntil: 0,
      isPrimary: false,
      createdAt: now + 3,
    }
  );

  store.progress.push(
    {
      profileId: primaryProfileId,
      mediaId: 'meridian-nine',
      positionSeconds: 9,
      durationSeconds: 24,
      updatedAt: now - 3600_000,
    },
    {
      profileId: primaryProfileId,
      mediaId: 'velvet-alibi',
      positionSeconds: 14,
      durationSeconds: 24,
      updatedAt: now - 7200_000,
    }
  );

  store.watchHistory.push(
    {
      profileId: primaryProfileId,
      mediaId: 'meridian-nine',
      lastPositionSeconds: 9,
      durationSeconds: 24,
      completed: false,
      watchedAt: now - 3600_000,
    },
    {
      profileId: primaryProfileId,
      mediaId: 'velvet-alibi',
      lastPositionSeconds: 14,
      durationSeconds: 24,
      completed: false,
      watchedAt: now - 7200_000,
    },
    {
      profileId: primaryProfileId,
      mediaId: 'svalbard-echoes',
      lastPositionSeconds: 24,
      durationSeconds: 24,
      completed: true,
      watchedAt: now - 86400_000,
    }
  );

  store.watchlist.push(
    { profileId: primaryProfileId, mediaId: 'kepler-signal', addedAt: now - 5000_000 },
    { profileId: primaryProfileId, mediaId: 'svalbard-echoes', addedAt: now - 4000_000 },
    { profileId: kidsProfileId, mediaId: 'clockwork-harbor', addedAt: now - 3000_000 }
  );

  store.favorites.push({
    profileId: primaryProfileId,
    mediaId: 'meridian-nine',
    favoritedAt: now - 3500_000,
  });

  appendAuditLog(store, accountId, 'HOUSEHOLD_CREATED', 'Demo household initialized with profile maturity controls.');
  saveStore(store);
  return account;
}
