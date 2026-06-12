import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { API } from "@/lib/api";
import { setAuthTokenGetter } from "@workspace/api-client-react";

setAuthTokenGetter(() => localStorage.getItem("hd_token"));

export interface AuthUser {
  userId: number;
  name: string;
  role: string;
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (name: string, password: string) => Promise<void>;
  logout: () => void;
  clearMustChange: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("hd_token");
    if (!token) { setIsLoading(false); return; }
    API.me()
      .then(u => setUser(u))
      .catch(() => { localStorage.removeItem("hd_token"); })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (name: string, password: string) => {
    const result = await API.login(name, password);
    localStorage.setItem("hd_token", result.token);
    setUser(result.user);
  };

  const logout = () => {
    API.logout().catch(() => {});
    localStorage.removeItem("hd_token");
    setUser(null);
  };

  const clearMustChange = () => {
    setUser(u => u ? { ...u, mustChangePassword: false } : u);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, clearMustChange }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
