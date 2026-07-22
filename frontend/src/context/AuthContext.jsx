import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);
const STORAGE_KEY = 'nexora-auth';

function loadStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadStored);
  // Don't block first paint when we already have a cached session.
  const [loading, setLoading] = useState(() => !loadStored()?.token);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const stored = loadStored();
      if (!stored?.token) {
        if (!cancelled) setLoading(false);
        return;
      }
      // Keep showing cached user while we revalidate.
      if (!cancelled) setLoading(false);
      try {
        const { user } = await api.me(stored.token);
        if (!cancelled) {
          setAuth({ token: stored.token, user });
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: stored.token, user }));
        }
      } catch {
        if (!cancelled) {
          setAuth(null);
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    }

    verify();
    return () => { cancelled = true; };
  }, []);

  async function login(email, password) {
    const { token, user } = await api.login(email, password);
    setAuth({ token, user });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
    return user;
  }

  function logout() {
    setAuth(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function updateUser(patch) {
    setAuth((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user: { ...prev.user, ...patch } };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <AuthContext.Provider value={{ user: auth?.user ?? null, token: auth?.token ?? null, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
