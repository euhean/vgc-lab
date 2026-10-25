import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { api, sessionEvents, tokenStore, type User } from './api/client';
import { AuthContext, useAuth } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(tokenStore.refresh() !== null);

  useEffect(() => {
    if (tokenStore.refresh() === null) return;
    api.me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const expire = () => setUser(null);
    sessionEvents.addEventListener('expired', expire);
    return () => sessionEvents.removeEventListener('expired', expire);
  }, []);

  const login = async (loginName: string, password: string) => {
    tokenStore.set(await api.login(loginName, password));
    setUser(await api.me());
  };

  const logout = async () => {
    const refreshToken = tokenStore.refresh();
    if (refreshToken) await api.logout(refreshToken);
    tokenStore.clear();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted center">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
