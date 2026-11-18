export type MaturityRating = 'G' | 'PG' | 'PG-13' | 'R';
export type AvatarKey = 'crimson' | 'obsidian' | 'cobalt' | 'amber' | 'emerald' | 'silver';
export type MediaType = 'movie' | 'show';

export interface AccountInfo {
  id: string;
  email: string;
  displayName: string;
  isDemo: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  avatarKey: AvatarKey;
  isKids: boolean;
  maxRating: MaturityRating;
  hasPin: boolean;
  isPrimary: boolean;
  pinLockedUntil: number;
}

export interface AuthStateResponse {
  authenticated: boolean;
  csrfToken?: string;
  sessionToken?: string;
  sessionWatermarkId?: string;
  account?: AccountInfo;
  profiles?: UserProfile[];
  activeProfile?: UserProfile | null;
}

export interface MediaItem {
  id: string;
  mediaType: MediaType;
  seasonsLabel: string | null;
  title: string;
  tagline: string;
  synopsis: string;
  director: string;
  cast: string[];
  year: number;
  durationLabel: string;
  durationSeconds: number;
  maturityRating: MaturityRating;
  genres: string[];
  quality: '4K HDR' | '1080p HD';
  audio: 'Dolby Atmos' | '5.1 Surround';
  backdropUrl: string;
  featured: boolean;
  trendingRank: number | null;
  inWatchlist: boolean;
  progressSeconds: number;
  lastWatchedAt: number;
}

export interface CatalogResponse {
  genres: string[];
  items: MediaItem[];
  totalAllowedCount: number;
}

export interface WatchHistoryEntry {
  mediaId: string;
  title: string;
  mediaType: MediaType;
  year: number;
  durationLabel: string;
  maturityRating: MaturityRating;
  backdropUrl: string;
  lastPositionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  watchedAt: number;
}

export interface StreamTicketResponse {
  ticket: string;
  expiresAt: number;
  streamUrl: string;
  watermark: string;
}

export interface ActiveSessionInfo {
  id: string;
  isCurrent: boolean;
  device: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface SecurityAuditEntry {
  id: string;
  accountId: string;
  event: string;
  detail: string;
  timestamp: number;
}

export interface SecurityOverviewResponse {
  sessions: ActiveSessionInfo[];
  auditLogs: SecurityAuditEntry[];
  controls: {
    passwordKdf: string;
    sessionCookie: string;
    csrfProtection: string;
    streamGuard: string;
    maturityGuard: string;
    pinBruteForceLockout: string;
  };
}
