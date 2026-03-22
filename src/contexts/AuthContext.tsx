import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { PlanId, SubStatus } from '../lib/plans';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'user';
  is_active: boolean;
  tenant_id: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  plan_id: PlanId;
  status: SubStatus;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  subscription: Subscription | null;
  refreshSubscription: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isSuperAdmin: boolean;
  tenantId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);

      if (data?.tenant_id) {
        await loadSubscription(data.tenant_id);
      }
    } catch (error) {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadSubscription(tenantId: string) {
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      setSubscription(data);
    } catch {
      setSubscription(null);
    }
  }

  async function refreshSubscription() {
    if (profile?.tenant_id) {
      await loadSubscription(profile.tenant_id);
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function signUp(email: string, password: string, fullName: string) {
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error('Falha ao criar usuário');

      // Usa RPC SECURITY DEFINER para criar perfil com tenant_id correto.
      // Resolve o bootstrap: primeiro usuário cria tenant + super_admin;
      // demais usuários entram no tenant existente como usuário regular.
      const { error: profileError } = await supabase
        .rpc('register_user_profile', { p_full_name: fullName, p_email: email });

      if (profileError) throw new Error('Erro ao criar perfil: ' + profileError.message);

      await loadProfile(authData.user.id);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setSubscription(null);
  }

  const isSuperAdmin = profile?.role === 'super_admin';
  const tenantId = profile?.tenant_id ?? null;

  const value = {
    user,
    profile,
    session,
    loading,
    subscription,
    refreshSubscription,
    signIn,
    signUp,
    signOut,
    isSuperAdmin,
    tenantId,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
