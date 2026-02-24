'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase-browser';
import type { Database } from '@/lib/types';

export type AppRole = 'admin' | 'manager' | 'driver' | 'viewer';
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

type AuthContextValue = {
  user: SupabaseUser | null;
  profile: ProfileRow | null;
  operatorId: string | null;
  role: AppRole | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const supabase = createBrowserClient();
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient();

    const syncAuthState = async (sessionUser: SupabaseUser | null) => {
      setIsLoading(true);

      if (!sessionUser) {
        setUser(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      const resolvedProfile = await fetchProfile(sessionUser.id);
      setUser(sessionUser);
      setProfile(resolvedProfile);
      setIsLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => {
      void syncAuthState(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncAuthState(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      operatorId: profile?.operator_id ?? null,
      role: (profile?.role as AppRole | null) ?? null,
      isLoading,
      signOut: async () => {
        const supabase = createBrowserClient();
        await supabase.auth.signOut();
      },
    }),
    [user, profile, isLoading]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D2B4E] shadow-lg">
            <span className="text-2xl font-extrabold tracking-tighter text-white">M.</span>
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-[#1565C0]" />
          <p className="text-sm font-medium text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
