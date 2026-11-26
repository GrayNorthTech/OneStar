import React, { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { KortrixLogo } from '../components/KortrixLogo';
import { Button, Field, inputClass } from '../components/ui';

export const AuthPage: React.FC = () => {
  const { authStatus, onAuthenticated } = useApp();
  const authConfigured = authStatus?.authConfigured ?? true;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ token: string; user: any }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await onAuthenticated(res.token, res.user);
    } catch (err: any) {
      setError(err.message || 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] dark:bg-[#0B1018] flex flex-col justify-between p-6">
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between py-2">
        <KortrixLogo logoDataUrl={authStatus?.branding?.logoDataUrl} />
        <div className="text-xs text-[#526075] dark:text-[#94A3B8] font-mono">
          one.kortrix.com
        </div>
      </div>

      <div className="w-full max-w-[420px] mx-auto my-8">
        <div className="bg-white dark:bg-[#141A24] border border-[#DCE2EA] dark:border-[#242D3D] rounded-md p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="font-display text-xl font-semibold text-[#0B1018] dark:text-white">
              Sign in to KORTRIX ONE
            </h1>
            <p className="mt-1.5 text-[13px] text-[#526075] dark:text-[#94A3B8] leading-relaxed">
              Authorized KORTRIX personnel only. Public account registration is disabled.
            </p>
          </div>

          {!authConfigured && (
            <div className="mb-4 p-3.5 rounded-md bg-[#F8FAFC] dark:bg-[#0B1018] border border-[#DCE2EA] dark:border-[#242D3D] text-xs text-[#334155] dark:text-[#CBD5E1] leading-relaxed">
              <div className="font-semibold text-[#0B1018] dark:text-white mb-1">Server Authentication Not Configured</div>
              Configure <code className="font-mono text-[#0047FF]">OWNER_ADMIN_PASSCODE</code> in server environment variables (or run <code className="font-mono">npx tsx scripts/set-owner-password.ts</code> on your server) to enable Owner sign-in.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-md bg-[#FEF2F2] dark:bg-[#450A0A]/40 border border-[#FECACA] dark:border-[#7F1D1D] flex items-start gap-2.5 text-[12.5px] text-[#B91C1C] dark:text-[#FCA5A5]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <Field label="Corporate Email" required>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@kortrix.com"
                className={inputClass}
              />
            </Field>
            <Field label="Password" required>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className={inputClass}
              />
            </Field>
            <Button type="submit" variant="primary" disabled={submitting || !authConfigured} className="w-full py-2.5">
              <Lock className="w-4 h-4" />
              {submitting ? 'Verifying Credentials...' : 'Sign In'}
            </Button>
          </form>

          {/* Microsoft Entra ID Enterprise SSO */}
          <div className="mt-6 pt-5 border-t border-[#DCE2EA] dark:border-[#242D3D]">
            <Button
              type="button"
              variant="secondary"
              disabled
              className="w-full justify-center opacity-70"
            >
              Sign in with Microsoft Entra ID (@kortrix.com)
            </Button>
            <p className="mt-2 text-[11.5px] text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
              {authStatus?.entraConfigured
                ? 'Microsoft Entra ID tenant detected. Complete OAuth callback verification under Administration -> Integrations.'
                : 'Microsoft 365 Entra ID SSO is not yet configured on this server.'}
            </p>
          </div>
        </div>
      </div>

      <footer className="max-w-5xl w-full mx-auto text-center text-[11.5px] text-[#64748B] py-2">
        KORTRIX · Affiliated with TheGrayUSA · Private Internal Platform
      </footer>
    </div>
  );
};
