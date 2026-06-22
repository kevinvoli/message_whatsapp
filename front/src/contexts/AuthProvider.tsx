'use client';

import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import axios from 'axios';
import { useChatStore } from '@/store/chatStore';

interface Permission {
  id: string;
  name: string;
  description?: string;
}

interface UserRaw {
  id: string;
  email: string;
  name: string;
  posteId?: string | null;
  poste_id: string;
  isWorkingToday?: boolean;
  absentToday?: boolean;
  isReplacing?: boolean;
  rbacEnabled?: boolean;
  permissions?: Permission[];
}

interface User {
  id: string;
  email: string;
  name: string;
  posteId?: string | null;
  poste_id: string;
  isWorkingToday?: boolean;
  absentToday?: boolean;
  isReplacing?: boolean;
  rbacEnabled: boolean;
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialized: boolean;
  isLoading: boolean;
  error: string | null;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizeUser = (raw: UserRaw): User => ({
  ...raw,
  poste_id: raw.poste_id ?? raw.posteId ?? '',
  posteId: raw.posteId ?? raw.poste_id ?? null,
  rbacEnabled: raw.rbacEnabled ?? false,
  permissions: raw.permissions?.map((p) => p.name) ?? [],
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = useChatStore((s) => s.reset);
  const loadAffinityChats = useChatStore((s) => s.loadAffinityChats);

  useEffect(() => {
    const bootstrapSession = async () => {
      if (!apiBaseUrl) {
        setInitialized(true);
        return;
      }

      try {
        const response = await axios.get<UserRaw>(`${apiBaseUrl}/auth/profile`, {
          withCredentials: true,
        });
        const userData = normalizeUser(response.data);
        setUser(userData);
        if (userData.poste_id) void loadAffinityChats(userData.poste_id);
      } catch {
        setUser(null);
      } finally {
        setInitialized(true);
      }
    };

    void bootstrapSession();
  }, []);

  // Poll silencieux toutes les 5 min pour détecter les changements de statut en cours de journée
  // (absence déclarée, remplacement, changement de groupe…)
  useEffect(() => {
    if (!apiBaseUrl) return;

    const refreshProfile = async () => {
      try {
        const response = await axios.get<UserRaw>(`${apiBaseUrl}/auth/profile`, {
          withCredentials: true,
        });
        setUser((prev) => {
          if (!prev) return prev;
          const fresh = normalizeUser(response.data);
          const changed =
            prev.isWorkingToday !== fresh.isWorkingToday ||
            prev.absentToday   !== fresh.absentToday    ||
            prev.isReplacing   !== fresh.isReplacing    ||
            prev.posteId       !== fresh.posteId        ||
            prev.rbacEnabled   !== fresh.rbacEnabled    ||
            prev.permissions.join(',') !== fresh.permissions.join(',');
          return changed ? fresh : prev;
        });
      } catch {
        // silencieux — si la session expire, le prochain 401 sur une vraie requête gère la déconnexion
      }
    };

    const id = setInterval(() => void refreshProfile(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const login = async (email: string, password: string) => {
    if (!apiBaseUrl) {
      setError('NEXT_PUBLIC_API_URL is not configured');
      throw new Error('NEXT_PUBLIC_API_URL is not configured');
    }

    setIsLoading(true);
    setError(null);

    // 4.10 — Obtenir la position GPS avant d'envoyer le login
    let latitude: number | undefined;
    let longitude: number | undefined;
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 8000,
            maximumAge: 60_000,
          }),
        );
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch {
        // Géoloc refusée ou indisponible — on tente quand même le login.
        // Si une restriction est configurée côté backend, il renverra une 403.
      }
    }

    try {
      const response = await axios.post<{ user: UserRaw; accessToken: string }>(
        `${apiBaseUrl}/auth/login`,
        { email, password, latitude, longitude },
        { withCredentials: true },
      );

      const userData = normalizeUser(response.data.user);
      setUser(userData);
      setToken(response.data.accessToken ?? null);
      if (userData.poste_id) void loadAffinityChats(userData.poste_id);
    } catch (err) {
      let errorMessage = 'Connexion échouée';
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 403) {
          // Restriction géographique ou accès refusé
          errorMessage =
            err.response?.data?.message ||
            'Connexion refusée : vous ne vous trouvez pas dans une zone autorisée. Activez la localisation et réessayez.';
        } else {
          errorMessage = err.response?.data?.message || 'Login failed';
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    if (apiBaseUrl) {
      try {
        await axios.post(
          `${apiBaseUrl}/auth/logout`,
          {},
          { withCredentials: true },
        );
      } catch {
        // best effort logout: local state is still reset
      }
    }

    setUser(null);
    setToken(null);
    reset();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        initialized,
        isLoading,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
