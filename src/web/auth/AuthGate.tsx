import { useState, type FormEvent, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { LegalLinks } from '@renderer/components/legal-links';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { supabase } from '../supabase';
import { useSession } from './useSession';

type Mode = 'signin' | 'signup' | 'reset';

const Shell = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}): JSX.Element => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-8">
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 shrink-0 text-primary" />
          <CardTitle className="text-xl">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
    <LegalLinks />
  </div>
);

/**
 * Web-only auth wall. Blocks the shared <App> until a Supabase session exists.
 * Also handles the password-reset request flow and the set-new-password step a
 * user lands on after following a reset email.
 */
export const AuthGate = ({ children }: { children: ReactNode }): JSX.Element => {
  const { session, loading, recovering, endRecovery } = useSession();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Landed here from a password-reset email → set a new password.
  if (recovering) {
    const submitNewPassword = async (e: FormEvent): Promise<void> => {
      e.preventDefault();
      if (password.length < 10) {
        setError('Password must be at least 10 characters.');
        return;
      }
      setBusy(true);
      setError(null);
      const { error } = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (error) {
        setError(error.message);
      } else {
        setPassword('');
        endRecovery();
      }
    };
    return (
      <Shell title="Reset password" description="Choose a new password for your account.">
        <form onSubmit={(e) => void submitNewPassword(e)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-pw">New password</Label>
            <Input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </Shell>
    );
  }

  if (session) return <>{children}</>;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setNotice('If that email has an account, a reset link is on its way.');
      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setNotice('Check your email to confirm your account, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const description =
    mode === 'reset'
      ? 'Enter your email and we’ll send a password-reset link.'
      : mode === 'signin'
        ? 'Sign in to sync your subscriptions across devices.'
        : 'Create an account to get started.';

  const submitLabel =
    mode === 'reset' ? 'Send reset link' : mode === 'signin' ? 'Sign in' : 'Create account';

  return (
    <Shell title="Tools & Subs Manager" description={description}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {mode !== 'reset' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === 'signin' && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setMode('reset');
                    setError(null);
                    setNotice(null);
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Please wait…' : submitLabel}
        </Button>
      </form>

      <div className="mt-3 space-y-1 text-center">
        {mode === 'reset' ? (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode('signin');
              setError(null);
              setNotice(null);
            }}
          >
            Back to sign in
          </button>
        ) : (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        )}
      </div>
    </Shell>
  );
};
