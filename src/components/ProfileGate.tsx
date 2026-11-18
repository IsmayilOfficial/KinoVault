import { useState, type FormEvent } from 'react';
import { Lock, Pencil, Plus, Shield, Trash2, X } from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import type { AccountInfo, AvatarKey, MaturityRating, UserProfile } from '../types';
import { AVATAR_KEYS, ProfileAvatar } from './ProfileAvatar';

interface ProfileGateProps {
  account: AccountInfo;
  profiles: UserProfile[];
  onProfileSelected: (profile: UserProfile) => void;
  onProfilesChanged: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

const RATINGS: MaturityRating[] = ['G', 'PG', 'PG-13', 'R'];

export function ProfileGate({
  account,
  profiles,
  onProfileSelected,
  onProfilesChanged,
  onSignOut,
}: ProfileGateProps) {
  const [manageMode, setManageMode] = useState(false);
  const [pinTarget, setPinTarget] = useState<UserProfile | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [gateError, setGateError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Create/Edit Profile modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);
  const [formName, setFormName] = useState('');
  const [formAvatar, setFormAvatar] = useState<AvatarKey>('crimson');
  const [formIsKids, setFormIsKids] = useState(false);
  const [formMaxRating, setFormMaxRating] = useState<MaturityRating>('R');
  const [formPin, setFormPin] = useState('');
  const [formCurrentPin, setFormCurrentPin] = useState('');
  const [formRemovePin, setFormRemovePin] = useState(false);
  const [editorError, setEditorError] = useState('');

  async function handleCardClick(profile: UserProfile) {
    if (manageMode) {
      openEditModal(profile);
      return;
    }

    if (profile.hasPin) {
      setPinTarget(profile);
      setPinInput('');
      setPinError('');
      return;
    }

    setGateError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ activeProfile: UserProfile }>(`/api/profiles/${profile.id}/select`, {
        method: 'POST',
        body: {},
      });
      onProfileSelected(res.activeProfile);
    } catch (err) {
      if (err instanceof ApiError && err.data?.pinRequired) {
        setPinTarget(profile);
        setPinInput('');
        setPinError(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        await onSignOut();
      } else {
        setGateError(err instanceof ApiError ? err.message : 'Unable to enter profile. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePinSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pinTarget) return;
    setPinError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ activeProfile: UserProfile }>(`/api/profiles/${pinTarget.id}/select`, {
        method: 'POST',
        body: { pin: pinInput },
      });
      setPinTarget(null);
      onProfileSelected(res.activeProfile);
    } catch (err) {
      setPinError(err instanceof ApiError ? err.message : 'Unable to verify PIN.');
    } finally {
      setSubmitting(false);
    }
  }

  function openCreateModal() {
    setEditingProfile(null);
    setFormName('');
    setFormAvatar('silver');
    setFormIsKids(false);
    setFormMaxRating('R');
    setFormPin('');
    setFormCurrentPin('');
    setFormRemovePin(false);
    setEditorError('');
    setEditorOpen(true);
  }

  function openEditModal(profile: UserProfile) {
    setEditingProfile(profile);
    setFormName(profile.name);
    setFormAvatar(profile.avatarKey);
    setFormIsKids(profile.isKids);
    setFormMaxRating(profile.maxRating);
    setFormPin('');
    setFormCurrentPin('');
    setFormRemovePin(false);
    setEditorError('');
    setEditorOpen(true);
  }

  async function handleEditorSubmit(e: FormEvent) {
    e.preventDefault();
    setEditorError('');
    setSubmitting(true);

    try {
      if (!editingProfile) {
        await apiRequest('/api/profiles', {
          method: 'POST',
          body: {
            name: formName,
            avatarKey: formAvatar,
            isKids: formIsKids,
            maxRating: formIsKids ? 'PG' : formMaxRating,
            pin: formPin.trim() ? formPin.trim() : undefined,
          },
        });
      } else {
        const body: Record<string, unknown> = {
          name: formName,
          avatarKey: formAvatar,
          isKids: formIsKids,
          maxRating: formIsKids ? 'PG' : formMaxRating,
        };
        if (formRemovePin) {
          body.pin = null;
          body.currentPin = formCurrentPin;
        } else if (formPin.trim()) {
          body.pin = formPin.trim();
          if (editingProfile.hasPin) {
            body.currentPin = formCurrentPin;
          }
        }
        await apiRequest(`/api/profiles/${editingProfile.id}`, {
          method: 'PATCH',
          body,
        });
      }

      await onProfilesChanged();
      setEditorOpen(false);
    } catch (err) {
      setEditorError(err instanceof ApiError ? err.message : 'Unable to save profile.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteProfile() {
    if (!editingProfile || editingProfile.isPrimary) return;
    setEditorError('');
    setSubmitting(true);
    try {
      await apiRequest(`/api/profiles/${editingProfile.id}`, { method: 'DELETE' });
      await onProfilesChanged();
      setEditorOpen(false);
    } catch (err) {
      setEditorError(err instanceof ApiError ? err.message : 'Unable to delete profile.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#08090B] text-[#F5F5F7] flex flex-col">
      <header className="flex items-center justify-between px-6 sm:px-12 py-6 max-w-[1440px] w-full mx-auto">
        <span className="font-display text-2xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          KinoVault
        </span>
        <div className="flex items-center gap-6">
          <span className="hidden sm:inline text-xs text-[#9CA3AF] truncate max-w-[240px]">
            {account.displayName}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="text-xs font-medium text-[#D1D5DB] hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-5xl w-full mx-auto">
        <div className="text-center mb-12">
          <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-white mb-3 text-balance">
            {manageMode ? 'Manage Profiles' : "Who's watching?"}
          </h1>
          <p className="text-sm text-[#9CA3AF]">
            {manageMode
              ? 'Configure maturity ratings, avatar styles, and PIN protection.'
              : 'Select a viewer profile to enforce personal watchlists and maturity controls.'}
          </p>
        </div>

        {gateError && (
          <div
            role="alert"
            className="mb-8 max-w-md w-full px-4 py-3 rounded-xl bg-[#E50914]/15 border border-[#E50914]/40 text-xs text-[#FCA5A5] text-center"
          >
            {gateError}
          </div>
        )}

        <div className="flex flex-wrap items-start justify-center gap-6 sm:gap-8 mb-12">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              disabled={submitting}
              onClick={() => handleCardClick(profile)}
              className="group flex flex-col items-center text-center w-32 sm:w-36 focus:outline-none"
            >
              <div className="relative mb-3 transition-transform duration-200 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-[#E50914] rounded-2xl">
                <ProfileAvatar
                  name={profile.name}
                  avatarKey={profile.avatarKey}
                  size="xl"
                  className={manageMode ? 'opacity-65' : 'group-hover:border-white/50'}
                />
                {manageMode && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40">
                    <Pencil className="w-6 h-6 text-white" />
                  </div>
                )}
                {!manageMode && profile.hasPin && (
                  <div
                    className="absolute bottom-2 right-2 w-7 h-7 rounded-lg bg-[#08090B]/90 border border-white/20 flex items-center justify-center"
                    title="PIN Protected"
                  >
                    <Lock className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
              <span className="text-sm font-medium text-[#D1D5DB] group-hover:text-white transition-colors truncate max-w-full">
                {profile.name}
              </span>
              <span className="mt-1 text-xs text-[#6B7280] whitespace-nowrap">
                {profile.isKids ? `Kids · ${profile.maxRating}` : `Rated up to ${profile.maxRating}`}
              </span>
            </button>
          ))}

          {profiles.length < 6 && (
            <button
              type="button"
              onClick={openCreateModal}
              className="group flex flex-col items-center text-center w-32 sm:w-36 focus:outline-none"
            >
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border border-dashed border-white/20 group-hover:border-white/50 bg-[#12141A]/60 flex items-center justify-center mb-3 transition-colors">
                <Plus className="w-8 h-8 text-[#9CA3AF] group-hover:text-white transition-colors" />
              </div>
              <span className="text-sm font-medium text-[#9CA3AF] group-hover:text-white transition-colors">
                Add Profile
              </span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setManageMode((m) => !m)}
          className="px-6 py-2.5 text-xs font-medium tracking-wide border border-white/20 hover:border-white/50 text-[#D1D5DB] hover:text-white rounded-lg transition-colors whitespace-nowrap"
        >
          {manageMode ? 'Done Managing' : 'Manage Profiles'}
        </button>
      </main>

      {/* PIN Challenge Modal */}
      {pinTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-modal-title"
        >
          <div className="w-full max-w-sm bg-[#12141A] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <ProfileAvatar name={pinTarget.name} avatarKey={pinTarget.avatarKey} size="sm" />
                <div>
                  <h2 id="pin-modal-title" className="font-display text-lg font-semibold text-white">
                    Unlock {pinTarget.name}
                  </h2>
                  <p className="text-xs text-[#9CA3AF]">Enter 4–6 digit profile PIN</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPinTarget(null)}
                aria-label="Close PIN prompt"
                className="p-1.5 text-[#9CA3AF] hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {account.isDemo && pinTarget.name === 'Private Vault' && (
              <p className="mb-4 px-3 py-2 rounded-lg bg-[#08090B] border border-white/10 text-xs text-[#D1D5DB]">
                Demo Private Vault PIN: <span className="font-mono-code text-white font-medium">1984</span>
              </p>
            )}

            {pinError && (
              <div role="alert" className="mb-4 px-3 py-2 rounded-lg bg-[#E50914]/15 border border-[#E50914]/40 text-xs text-[#FCA5A5]">
                {pinError}
              </div>
            )}

            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4,6}"
                minLength={4}
                maxLength={6}
                autoFocus
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••"
                className="w-full px-4 py-3 text-center text-xl tracking-[0.4em] font-mono-code bg-[#08090B] border border-white/15 rounded-lg text-white focus:outline-none focus:border-[#E50914]"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPinTarget(null)}
                  className="flex-1 py-2.5 px-4 bg-[#1D2029] hover:bg-[#262A36] text-xs font-medium text-[#D1D5DB] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || pinInput.length < 4}
                  className="flex-1 py-2.5 px-4 bg-[#E50914] hover:bg-[#C80812] disabled:opacity-50 text-xs font-semibold text-white rounded-lg"
                >
                  {submitting ? 'Verifying...' : 'Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Profile Modal */}
      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-editor-title"
        >
          <div className="w-full max-w-md bg-[#12141A] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 id="profile-editor-title" className="font-display text-xl font-semibold text-white">
                {editingProfile ? `Edit ${editingProfile.name}` : 'New Viewer Profile'}
              </h2>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label="Close profile editor"
                className="p-1.5 text-[#9CA3AF] hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editorError && (
              <div role="alert" className="mb-4 px-3 py-2 rounded-lg bg-[#E50914]/15 border border-[#E50914]/40 text-xs text-[#FCA5A5]">
                {editorError}
              </div>
            )}

            <form onSubmit={handleEditorSubmit} className="space-y-4">
              <div>
                <label htmlFor="profile-name" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                  Profile Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  maxLength={24}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Sam"
                  className="w-full px-3.5 py-2.5 bg-[#08090B] border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-[#E50914]"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-[#D1D5DB] mb-2">Avatar Tone</span>
                <div className="flex items-center gap-2.5">
                  {AVATAR_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFormAvatar(key)}
                      aria-label={`Select ${key} avatar`}
                      className={`rounded-xl p-0.5 transition-transform ${
                        formAvatar === key ? 'ring-2 ring-[#E50914] scale-105' : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      <ProfileAvatar name={formName || 'K'} avatarKey={key} size="md" />
                    </button>
                  ))}
                </div>
              </div>

              {(!editingProfile || !editingProfile.isPrimary) && (
                <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#08090B] border border-white/10 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-white">Kids Profile</div>
                    <div className="text-xs text-[#9CA3AF]">Restricts library to G & PG titles and hides security settings.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formIsKids}
                    onChange={(e) => {
                      setFormIsKids(e.target.checked);
                      if (e.target.checked) setFormMaxRating('PG');
                    }}
                    className="w-4 h-4 accent-[#E50914]"
                  />
                </label>
              )}

              {!formIsKids && (
                <div>
                  <label htmlFor="profile-rating" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                    Maximum Maturity Rating
                  </label>
                  <select
                    id="profile-rating"
                    value={formMaxRating}
                    onChange={(e) => setFormMaxRating(e.target.value as MaturityRating)}
                    className="w-full px-3.5 py-2.5 bg-[#08090B] border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-[#E50914]"
                  >
                    {RATINGS.map((r) => (
                      <option key={r} value={r}>
                        Up to {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!formIsKids && (
                <div className="pt-2 border-t border-white/10 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#D1D5DB]">
                    <Shield className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    <span>Profile PIN Lock (4–6 digits, optional)</span>
                  </div>

                  {editingProfile?.hasPin && (
                    <div>
                      <label htmlFor="current-pin" className="block text-xs text-[#9CA3AF] mb-1">
                        Current PIN (required to change or remove lock)
                      </label>
                      <input
                        id="current-pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={formCurrentPin}
                        onChange={(e) => setFormCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Current PIN"
                        className="w-full px-3.5 py-2 bg-[#08090B] border border-white/15 rounded-lg text-sm font-mono-code text-white focus:outline-none focus:border-[#E50914]"
                      />
                    </div>
                  )}

                  {!formRemovePin && (
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={formPin}
                      onChange={(e) => setFormPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder={editingProfile?.hasPin ? 'New PIN (leave blank to keep)' : 'Set 4–6 digit PIN'}
                      className="w-full px-3.5 py-2 bg-[#08090B] border border-white/15 rounded-lg text-sm font-mono-code text-white focus:outline-none focus:border-[#E50914]"
                    />
                  )}

                  {editingProfile?.hasPin && (
                    <label className="flex items-center gap-2 text-xs text-[#D1D5DB] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formRemovePin}
                        onChange={(e) => setFormRemovePin(e.target.checked)}
                        className="accent-[#E50914]"
                      />
                      Remove PIN lock from this profile
                    </label>
                  )}
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-3">
                {editingProfile && !editingProfile.isPrimary ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleDeleteProfile}
                    className="px-3 py-2.5 text-xs font-medium text-[#FCA5A5] hover:text-white hover:bg-[#E50914]/20 rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditorOpen(false)}
                    className="px-4 py-2.5 text-xs font-medium bg-[#1D2029] hover:bg-[#262A36] text-[#D1D5DB] rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 text-xs font-semibold bg-[#E50914] hover:bg-[#C80812] disabled:opacity-50 text-white rounded-lg"
                  >
                    {submitting ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
