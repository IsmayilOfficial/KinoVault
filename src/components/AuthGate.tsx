import { useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, Play } from 'lucide-react';
import { ApiError, apiRequest, setCsrfToken, setSessionToken } from '../lib/api';
import type { AuthStateResponse } from '../types';

interface AuthGateProps {
  onAuthenticated: (state: AuthStateResponse) => void;
}

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [devResetPreview, setDevResetPreview] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (mode === 'forgot') {
        const res = await apiRequest<{ ok: boolean; message: string; devPreviewToken?: string }>(
          '/api/auth/forgot-password',
          { method: 'POST', body: { email } }
        );
        setNotice(res.message);
        if (res.devPreviewToken) {
          setDevResetPreview(res.devPreviewToken);
          setResetToken(res.devPreviewToken);
        }
        setMode('reset');
        return;
      }

      if (mode === 'reset') {
        const res = await apiRequest<{ ok: boolean; message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: { token: resetToken, newPassword: password },
        });
        setPassword('');
        setResetToken('');
        setDevResetPreview('');
        setNotice(res.message);
        setMode('login');
        return;
      }

      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email, password }
          : { email, displayName, password };
      const data = await apiRequest<AuthStateResponse>(endpoint, {
        method: 'POST',
        body: payload,
      });
      setCsrfToken(data.csrfToken);
      setSessionToken(data.sessionToken);
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to complete request.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoEnter() {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const data = await apiRequest<AuthStateResponse>('/api/auth/demo', {
        method: 'POST',
      });
      setCsrfToken(data.csrfToken);
      setSessionToken(data.sessionToken);
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to start demo session.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#08090B] text-[#F5F5F7]">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <img
          src="/src/assets/images/cinema_meridian_nine_1795041005320.jpg"
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-40 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#08090B] via-[#08090B]/75 to-[#08090B]/90" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 sm:px-12 py-6 max-w-[1440px] w-full mx-auto">
        <span className="font-display text-2xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          KinoVault
        </span>
        <span className="text-xs text-[#9CA3AF] whitespace-nowrap shrink-0">
          Private Home Cinema
        </span>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-[#12141A]/95 border border-white/10 rounded-2xl p-8 shadow-2xl">
          {(mode === 'forgot' || mode === 'reset') && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
                setNotice('');
              }}
              className="mb-4 inline-flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Sign In
            </button>
          )}

          <div className="mb-6">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-white mb-2">
              {mode === 'login'
                ? 'Sign in to your cinema'
                : mode === 'register'
                  ? 'Create your household'
                  : mode === 'forgot'
                    ? 'Reset your password'
                    : 'Set a new password'}
            </h1>
            <p className="text-sm text-[#9CA3AF] leading-relaxed">
              {mode === 'login'
                ? 'Stream your private film library with profile maturity gates and signed media tickets.'
                : mode === 'register'
                  ? 'Set up a secure household vault with custom viewer profiles and PIN locks.'
                  : mode === 'forgot'
                    ? 'Enter your account email to issue a single-use 15-minute reset token.'
                    : 'Enter your reset token and choose a strong new password.'}
            </p>
          </div>

          {(mode === 'login' || mode === 'register') && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#08090B] border border-white/10 rounded-lg mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setNotice('');
                }}
                className={`py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'login'
                    ? 'bg-[#1D2029] text-white'
                    : 'text-[#9CA3AF] hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                  setNotice('');
                }}
                className={`py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register'
                    ? 'bg-[#1D2029] text-white'
                    : 'text-[#9CA3AF] hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 px-3.5 py-2.5 rounded-lg bg-[#E50914]/15 border border-[#E50914]/40 text-sm text-[#FCA5A5]"
            >
              {error}
            </div>
          )}

          {notice && (
            <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200 leading-relaxed">
              {notice}
              {devResetPreview && (
                <div className="mt-2 pt-2 border-t border-emerald-500/20 font-mono-code text-[11px] break-all text-white">
                  Dev Preview Token: {devResetPreview}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-display-name" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                  Household Name
                </label>
                <input
                  id="auth-display-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={40}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g., Miller Residence"
                  className="w-full px-3.5 py-2.5 bg-[#08090B] border border-white/15 rounded-lg text-sm text-white placeholder-[#6B7280] focus:outline-none focus:border-[#E50914]"
                />
              </div>
            )}

            {mode !== 'reset' && (
              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full px-3.5 py-2.5 bg-[#08090B] border border-white/15 rounded-lg text-sm text-white placeholder-[#6B7280] focus:outline-none focus:border-[#E50914]"
                />
              </div>
            )}

            {mode === 'reset' && (
              <div>
                <label htmlFor="auth-reset-token" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                  Reset Token
                </label>
                <input
                  id="auth-reset-token"
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="48-character hex token"
                  className="w-full px-3.5 py-2.5 bg-[#08090B] border border-white/15 rounded-lg text-xs font-mono-code text-white placeholder-[#6B7280] focus:outline-none focus:border-[#E50914]"
                />
              </div>
            )}

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="block text-xs font-medium text-[#D1D5DB]">
                    {mode === 'reset' ? 'New Password' : 'Password'}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError('');
                        setNotice('');
                      }}
                      className="text-xs text-[#9CA3AF] hover:text-white"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={mode === 'login' ? 1 : 10}
                    maxLength={128}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? 'Enter your password' : '10+ chars, upper, lower, number'}
                    className="w-full px-3.5 py-2.5 pr-10 bg-[#08090B] border border-white/15 rounded-lg text-sm text-white placeholder-[#6B7280] focus:outline-none focus:border-[#E50914]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#9CA3AF] hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {(mode === 'register' || mode === 'reset') && (
                  <p className="mt-1.5 text-xs text-[#9CA3AF]">
                    Minimum 10 characters with uppercase, lowercase, and a number.
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#E50914] hover:bg-[#C80812] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              {loading
                ? 'Processing...'
                : mode === 'login'
                  ? 'Sign In'
                  : mode === 'register'
                    ? 'Create Household'
                    : mode === 'forgot'
                      ? 'Send Reset Token'
                      : 'Reset Password'}
            </button>
          </form>

          {(mode === 'login' || mode === 'register') && (
            <>
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-[#9CA3AF]">or</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleDemoEnter}
                className="w-full py-2.5 px-4 bg-[#1D2029] hover:bg-[#262A36] border border-white/10 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                Enter Demo Household
              </button>
            </>
          )}

          <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-[#9CA3AF]">
            <Lock className="w-3.5 h-3.5 shrink-0 text-[#D1D5DB]" />
            <span>scrypt KDF, HttpOnly sessions, CSRF tokens & signed stream licenses.</span>
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-6 sm:px-12 py-5 text-xs text-[#6B7280] max-w-[1440px] w-full mx-auto">
        KinoVault Private Cinema
      </footer>
    </div>
  );
}
