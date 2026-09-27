import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { DEFAULT_MAX_FILE_MB, env, isConfigured } from '@/config/env';
import { toUserMessage } from '@/lib/errors';
import { usernameToEmail } from '@/lib/format';
import type { ClientConfig, Profile } from '@/types/db';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  maxFileMb: number;
  companyName: string;
  isAdmin: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const [maxFileMb, setMaxFileMb] = useState(DEFAULT_MAX_FILE_MB);
  const [companyName, setCompanyName] = useState('Metalplafer');

  /**
   * Carga el perfil del usuario. El rol y el estado activo se leen SIEMPRE
   * de la base de datos, nunca del token, para que no puedan falsearse.
   */
  const loadProfile = useCallback(async (current: Session | null) => {
    if (!current) { setProfile(null); return; }

    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', current.user.id).maybeSingle();

    if (error) { setAuthError(toUserMessage(error)); setProfile(null); return; }

    if (!data) {
      setAuthError('Tu usuario no tiene perfil en METALPLAFER360. Pide a administración que lo revise.');
      await supabase.auth.signOut();
      setProfile(null);
      return;
    }
    if (!data.active) {
      setAuthError('Tu usuario está desactivado. Contacta con administración.');
      await supabase.auth.signOut();
      setProfile(null);
      return;
    }

    setProfile(data as Profile);

    const cfg = await supabase.rpc('client_config');
    if (!cfg.error && cfg.data) {
      const c = cfg.data as ClientConfig;
      if (c.max_file_mb) setMaxFileMb(Number(c.max_file_mb));
      if (c.company_name) setCompanyName(c.company_name);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (alive) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') setProfile(null);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Fuera del callback: Supabase desaconseja llamar a su API dentro de él.
        setTimeout(() => { void loadProfile(next); }, 0);
      }
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (username: string, password: string) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username, env.loginDomain),
      password,
    });
    if (error) throw error;
    setSession(data.session);
    await loadProfile(data.session);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut().catch(() => undefined);
    setSession(null);
    setProfile(null);
    setAuthError(null);
  }, []);

  const value = useMemo<AuthState>(() => ({
    session, profile, loading, authError, maxFileMb, companyName,
    isAdmin: profile?.role === 'admin',
    signIn, signOut,
    refreshProfile: () => loadProfile(session),
  }), [session, profile, loading, authError, maxFileMb, companyName, signIn, signOut, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth se ha usado fuera de AuthProvider');
  return value;
}

/** Perfil garantizado dentro de las rutas protegidas. */
export function useProfile(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('No hay sesión iniciada');
  return profile;
}
