import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Clock, Film, Play, Trash2 } from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import type { AccountInfo, AvatarKey, MediaItem, UserProfile, WatchHistoryEntry } from '../types';
import { AVATAR_KEYS, ProfileAvatar } from './ProfileAvatar';

interface ProfileHistoryViewProps {
  account: AccountInfo;
  activeProfile: UserProfile;
  catalog: MediaItem[];
  onProfileUpdated: (profile: UserProfile, account: AccountInfo) => void;
  onPlayMedia: (item: MediaItem) => void;
  onBrowse: () => void;
}

function formatWatchedAt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProfileHistoryView({
  account,
  activeProfile,
  catalog,
  onProfileUpdated,
  onPlayMedia,
  onBrowse,
}: ProfileHistoryViewProps) {
  const [name, setName] = useState(activeProfile.name);
  const [avatarKey, setAvatarKey] = useState<AvatarKey>(activeProfile.avatarKey);
  const [displayName, setDisplayName] = useState(account.displayName);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  const [history, setHistory] = useState<WatchHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    setName(activeProfile.name);
    setAvatarKey(activeProfile.avatarKey);
    setDisplayName(account.displayName);
  }, [account.displayName, activeProfile]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await apiRequest<{ history: WatchHistoryEntry[] }>('/api/history');
      setHistory(data.history);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage('');
    setSaveError('');
    try {
      const res = await apiRequest<{ activeProfile: UserProfile; account: AccountInfo }>(
        '/api/account/profile',
        {
          method: 'PATCH',
          body: {
            name,
            avatarKey,
            ...(activeProfile.isPrimary ? { displayName } : {}),
          },
        }
      );
      onProfileUpdated(res.activeProfile, res.account);
      setSaveMessage('Profile details updated.');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveEntry(mediaId: string) {
    try {
      await apiRequest(`/api/history/${encodeURIComponent(mediaId)}`, { method: 'DELETE' });
      setHistory((prev) => prev.filter((h) => h.mediaId !== mediaId));
    } catch {
      // Ignore transient errors
    }
  }

  async function handleClearAll() {
    try {
      await apiRequest('/api/history', { method: 'DELETE' });
      setHistory([]);
    } catch {
      // Ignore transient errors
    }
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-10 pt-28 pb-20 space-y-10">
      <div className="border-b border-white/10 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white mb-1.5">
            Profile & Watch History
          </h1>
          <p className="text-sm text-[#9CA3AF]">
            Update your viewer identity and review playback history for {activeProfile.name}.
          </p>
        </div>
        <div className="text-xs text-[#9CA3AF]">
          Rating Cap: <span className="text-white font-medium">{activeProfile.maxRating}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Basic Profile Info Form */}
        <section className="lg:col-span-4 bg-[#12141A] border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-6">
            <ProfileAvatar name={name || activeProfile.name} avatarKey={avatarKey} size="lg" />
            <div className="min-w-0">
              <div className="font-display text-lg font-semibold text-white truncate">
                {name || activeProfile.name}
              </div>
              <div className="text-xs text-[#9CA3AF] truncate">{account.email}</div>
            </div>
          </div>

          {saveError && (
            <div role="alert" className="mb-4 px-3 py-2 rounded-lg bg-[#E50914]/15 border border-[#E50914]/40 text-xs text-[#FCA5A5]">
              {saveError}
            </div>
          )}
          {saveMessage && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300">
              {saveMessage}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label htmlFor="prof-name" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                Profile Name
              </label>
              <input
                id="prof-name"
                type="text"
                required
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#08090B] border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-[#E50914]"
              />
            </div>

            {activeProfile.isPrimary && (
              <div>
                <label htmlFor="prof-household" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                  Household Display Name
                </label>
                <input
                  id="prof-household"
                  type="text"
                  required
                  minLength={2}
                  maxLength={40}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#08090B] border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-[#E50914]"
                />
              </div>
            )}

            <div>
              <span className="block text-xs font-medium text-[#D1D5DB] mb-2">Avatar Tone</span>
              <div className="flex flex-wrap items-center gap-2">
                {AVATAR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAvatarKey(key)}
                    aria-label={`Select ${key} avatar`}
                    className={`rounded-xl p-0.5 transition-transform ${
                      avatarKey === key ? 'ring-2 ring-[#E50914] scale-105' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <ProfileAvatar name={name || 'K'} avatarKey={key} size="md" />
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 px-4 bg-[#E50914] hover:bg-[#C80812] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </form>
        </section>

        {/* Watch History List */}
        <section className="lg:col-span-8 bg-[#12141A] border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-[#E50914]" />
              <h2 className="font-display text-lg font-semibold text-white">Watch History</h2>
            </div>

            {history.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs font-medium text-[#9CA3AF] hover:text-white transition-colors"
              >
                Clear History
              </button>
            )}
          </div>

          {loadingHistory ? (
            <div className="py-12 text-center text-sm text-[#9CA3AF]">Loading watch history...</div>
          ) : history.length === 0 ? (
            <div className="py-14 text-center bg-[#08090B] border border-white/10 rounded-xl">
              <Film className="w-8 h-8 text-[#6B7280] mx-auto mb-3" />
              <p className="text-sm font-medium text-white mb-1">No watch history yet</p>
              <p className="text-xs text-[#9CA3AF] mb-4">
                Films and shows you watch will appear here for quick resuming.
              </p>
              <button
                type="button"
                onClick={onBrowse}
                className="px-4 py-2 bg-[#E50914] hover:bg-[#C80812] text-xs font-semibold text-white rounded-lg"
              >
                Browse Titles
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {history.map((entry) => {
                const pct =
                  entry.durationSeconds > 0
                    ? Math.min(100, Math.round((entry.lastPositionSeconds / entry.durationSeconds) * 100))
                    : 0;
                const mediaItem = catalog.find((m) => m.id === entry.mediaId);

                return (
                  <div
                    key={entry.mediaId}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-32 aspect-video rounded-lg overflow-hidden bg-[#08090B] border border-white/10 shrink-0 relative">
                        <img
                          src={entry.backdropUrl}
                          alt={entry.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        {pct > 0 && (
                          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                            <div className="h-full bg-[#E50914]" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="font-medium text-sm text-white truncate">{entry.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#9CA3AF]">
                          <span>{entry.mediaType === 'show' ? 'Series' : 'Movie'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{entry.year}</span>
                          <span aria-hidden="true">·</span>
                          <span>{entry.maturityRating}</span>
                          <span aria-hidden="true">·</span>
                          <span>{entry.completed ? 'Completed' : `${pct}% watched`}</span>
                        </div>
                        <div className="mt-1 text-xs text-[#6B7280] font-mono-code">
                          Last watched {formatWatchedAt(entry.watchedAt)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {mediaItem && (
                        <button
                          type="button"
                          onClick={() => onPlayMedia(mediaItem)}
                          className="px-3.5 py-2 bg-[#1D2029] hover:bg-[#262A36] border border-white/10 text-xs font-medium text-white rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          {entry.completed || entry.lastPositionSeconds === 0 ? 'Watch Again' : 'Resume'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveEntry(entry.mediaId)}
                        aria-label={`Remove ${entry.title} from watch history`}
                        className="p-2 text-[#9CA3AF] hover:text-[#FCA5A5] hover:bg-[#E50914]/15 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
