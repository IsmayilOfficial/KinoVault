import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, Laptop, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { ApiError, apiRequest, setCsrfToken } from '../lib/api';
import type { AccountInfo, SecurityOverviewResponse } from '../types';

interface SecurityCenterViewProps {
  account: AccountInfo;
  onSwitchProfile: () => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SecurityCenterView({ account, onSwitchProfile }: SecurityCenterViewProps) {
  const [overview, setOverview] = useState<SecurityOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Password update form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<SecurityOverviewResponse>('/api/security/overview');
      setOverview(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load security overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function handleRevokeSession(sessionId: string) {
    try {
      await apiRequest(`/api/security/sessions/${sessionId}`, { method: 'DELETE' });
      await loadOverview();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to revoke session.');
    }
  }

  async function handlePasswordUpdate(e: FormEvent) {
    e.preventDefault();
    setPwdError('');
    setPwdMessage('');
    setSavingPwd(true);
    try {
      const res = await apiRequest<{ ok: boolean; csrfToken?: string }>('/api/security/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      if (res.csrfToken) setCsrfToken(res.csrfToken);
      setCurrentPassword('');
      setNewPassword('');
      setPwdMessage('Password updated and all other active sessions revoked.');
      await loadOverview();
    } catch (err) {
      setPwdError(err instanceof ApiError ? err.message : 'Unable to update password.');
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-10 pt-28 pb-20 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white mb-2">
            Household Security & Sessions
          </h1>
          <p className="text-sm text-[#9CA3AF]">
            Manage active sessions, credentials, profile PIN locks, and inspect server-enforced protections for {account.email}.
          </p>
        </div>
        <button
          type="button"
          onClick={onSwitchProfile}
          className="px-4 py-2.5 bg-[#12141A] hover:bg-[#1D2029] border border-white/15 text-xs font-medium text-white rounded-lg inline-flex items-center gap-2 self-start sm:self-auto whitespace-nowrap"
        >
          <Lock className="w-3.5 h-3.5" />
          Manage Profile PINs
        </button>
      </div>

      {error && (
        <div role="alert" className="px-4 py-3 rounded-xl bg-[#E50914]/15 border border-[#E50914]/40 text-sm text-[#FCA5A5]">
          {error}
        </div>
      )}

      {loading && !overview ? (
        <div className="py-16 text-center text-sm text-[#9CA3AF]">Loading security configuration...</div>
      ) : overview ? (
        <>
          {/* Two-column Sessions + Password */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Active Sessions */}
            <section className="bg-[#12141A] border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <Laptop className="w-4 h-4 text-[#E50914]" />
                <h2 className="font-display text-lg font-semibold text-white">Active Sessions</h2>
              </div>

              <div className="divide-y divide-white/10">
                {overview.sessions.map((s) => (
                  <div key={s.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <span className="truncate">{s.device}</span>
                        {s.isCurrent && (
                          <span className="text-xs text-[#E50914] font-medium whitespace-nowrap">
                            · Current session
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#9CA3AF] mt-0.5 font-mono-code">
                        Last active {formatDate(s.lastSeenAt)} · Expires {formatDate(s.expiresAt)}
                      </div>
                    </div>

                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(s.id)}
                        className="px-3 py-1.5 text-xs font-medium text-[#FCA5A5] hover:text-white bg-[#E50914]/15 hover:bg-[#E50914]/30 rounded-lg inline-flex items-center gap-1.5 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Change Password */}
            <section className="bg-[#12141A] border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <KeyRound className="w-4 h-4 text-[#E50914]" />
                <h2 className="font-display text-lg font-semibold text-white">Account Credentials</h2>
              </div>

              {account.isDemo ? (
                <div className="p-4 rounded-xl bg-[#08090B] border border-white/10 text-sm text-[#D1D5DB] leading-relaxed">
                  You are currently viewing the isolated Demo Household. Create a personal KinoVault account from the sign-in screen to configure your own password and private sessions.
                </div>
              ) : (
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                  {pwdError && (
                    <div role="alert" className="px-3 py-2 rounded-lg bg-[#E50914]/15 border border-[#E50914]/40 text-xs text-[#FCA5A5]">
                      {pwdError}
                    </div>
                  )}
                  {pwdMessage && (
                    <div className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300">
                      {pwdMessage}
                    </div>
                  )}

                  <div>
                    <label htmlFor="sec-cur-pwd" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                      Current Password
                    </label>
                    <input
                      id="sec-cur-pwd"
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#08090B] border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-[#E50914]"
                    />
                  </div>

                  <div>
                    <label htmlFor="sec-new-pwd" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                      New Password (10+ chars, upper, lower, number)
                    </label>
                    <input
                      id="sec-new-pwd"
                      type="password"
                      required
                      minLength={10}
                      maxLength={128}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#08090B] border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-[#E50914]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingPwd}
                    className="px-5 py-2.5 bg-[#E50914] hover:bg-[#C80812] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {savingPwd ? 'Updating...' : 'Update Password & Revoke Other Sessions'}
                  </button>
                </form>
              )}
            </section>
          </div>

          {/* Enforced Server Controls */}
          <section className="bg-[#12141A] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <ShieldCheck className="w-4 h-4 text-[#E50914]" />
              <h2 className="font-display text-lg font-semibold text-white">Active Server-Side Protections</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: 'Credential Hashing', value: overview.controls.passwordKdf },
                { label: 'Session Storage', value: overview.controls.sessionCookie },
                { label: 'CSRF Defense', value: overview.controls.csrfProtection },
                { label: 'Media Stream Guard', value: overview.controls.streamGuard },
                { label: 'Parental Controls', value: overview.controls.maturityGuard },
                { label: 'Brute-Force Lockout', value: overview.controls.pinBruteForceLockout },
              ].map((row) => (
                <div key={row.label} className="p-4 rounded-xl bg-[#08090B] border border-white/10">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#9CA3AF] mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{row.label}</span>
                  </div>
                  <div className="text-sm font-medium text-white">{row.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Security Audit Log */}
          <section className="bg-[#12141A] border border-white/10 rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-white mb-4">Recent Security Events</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[#9CA3AF]">
                    <th className="py-2.5 pr-4 font-medium">Timestamp</th>
                    <th className="py-2.5 pr-4 font-medium">Event</th>
                    <th className="py-2.5 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {overview.auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-3 pr-4 font-mono-code text-[#9CA3AF] whitespace-nowrap">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="py-3 pr-4 font-mono-code text-white whitespace-nowrap">
                        {log.event}
                      </td>
                      <td className="py-3 text-[#D1D5DB]">{log.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
