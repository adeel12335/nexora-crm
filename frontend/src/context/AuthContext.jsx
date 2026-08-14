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

function persist(next) {
  if (!next) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
        const data = await api.me(stored.token);
        if (!cancelled) {
          const next = {
            token: stored.token,
            user: data.user,
            impersonating: data.impersonating || null,
          };
          setAuth(next);
          persist(next);
        }
      } catch {
        if (!cancelled) {
          setAuth(null);
          persist(null);
        }
      }
    }

    verify();
    return () => { cancelled = true; };
  }, []);

  async function login(email, password) {
    const { token, user } = await api.login(email, password);
    const next = { token, user, impersonating: null };
    setAuth(next);
    persist(next);
    return user;
  }

  function logout() {
    setAuth(null);
    persist(null);
  }

  function updateUser(patch) {
    setAuth((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user: { ...prev.user, ...patch } };
      persist(next);
      return next;
    });
  }

  /** Admin → browse as another user. Returns the target user. */
  async function switchToUser(userId) {
    if (!auth?.token) throw new Error('Not authenticated');
    const data = await api.switchUser(auth.token, userId);
    const next = {
      token: data.token,
      user: data.user,
      impersonating: data.impersonating || null,
    };
    setAuth(next);
    persist(next);
    return data.user;
  }

  /** Leave impersonation and restore the original admin session. */
  async function exitImpersonation() {
    if (!auth?.token) throw new Error('Not authenticated');
    const data = await api.switchBack(auth.token);
    const next = { token: data.token, user: data.user, impersonating: null };
    setAuth(next);
    persist(next);
    return data.user;
  }

  return (
    <AuthContext.Provider
      value={{
        user: auth?.user ?? null,
        token: auth?.token ?? null,
        impersonating: auth?.impersonating ?? null,
        loading,
        login,
        logout,
        updateUser,
        switchToUser,
        exitImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
