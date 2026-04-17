import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type User = {
  id: string;
  email: string;
  subscription_status: string;
  has_access: boolean;
  is_on_trial: boolean;
  trial_days_remaining: number | null;
  trial_ends_at: string | null;
  created_at: string;
};

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  login: (token: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = "lc_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, loading: true });

  const fetchMe = useCallback(async (token: string): Promise<User | null> => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json() as Promise<User>;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setState({ user: null, token: null, loading: false });
      return;
    }
    fetchMe(stored).then((user) => {
      if (user) {
        setState({ user, token: stored, loading: false });
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setState({ user: null, token: null, loading: false });
      }
    });
  }, [fetchMe]);

  const login = useCallback(
    async (token: string) => {
      const user = await fetchMe(token);
      if (!user) throw new Error("Failed to fetch user after login.");
      localStorage.setItem(TOKEN_KEY, token);
      setState({ user, token, loading: false });
    },
    [fetchMe],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ user: null, token: null, loading: false });
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const user = await fetchMe(token);
    if (user) setState((s) => ({ ...s, user }));
  }, [fetchMe]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
