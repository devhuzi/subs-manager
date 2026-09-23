import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';

export interface SessionState {
  session: Session | null;
  /** True until the initial getSession() resolves, so we don't flash the login
   * screen before a persisted session is restored. */
  loading: boolean;
  /** True after the user follows a password-reset link — show the set-new-password
   * form instead of the app. */
  recovering: boolean;
  /** Called once a new password is set, to leave recovery mode. */
  endRecovery: () => void;
}

/** Tracks the Supabase auth session and keeps it live across login/logout. */
export const useSession = (): SessionState => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const endRecovery = useCallback(() => setRecovering(false), []);

  return { session, loading, recovering, endRecovery };
};
