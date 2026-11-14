import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, ApiError } from './api';
import type { Role, User } from './types';
import { ListSkeleton } from '../components/ui/States';

interface AuthState {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({ user: null, loading: true, refresh: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: User }>('/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const value: AuthState = {
    user: me.data ?? null,
    loading: me.isLoading,
    refresh: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    signOut: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

// RequireRole sends people to the right sign-in page instead of showing an error.
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-6"><ListSkeleton rows={3} /></div>;
  if (!user || !roles.includes(user.role)) {
    const target = roles.includes('citizen') ? '/signin' : '/staff/login';
    return <Navigate to={`${target}?next=${encodeURIComponent(loc.pathname)}`} replace />;
  }
  return <>{children}</>;
}

export function homeFor(role: Role): string {
  switch (role) {
    case 'dispatcher':
      return '/dashboard';
    case 'technician':
      return '/tech';
    case 'admin':
      return '/admin';
    default:
      return '/my-reports';
  }
}
