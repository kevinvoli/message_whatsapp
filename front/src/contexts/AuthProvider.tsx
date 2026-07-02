'use client';

import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import axios, { type InternalAxiosRequestConfig } from 'axios';
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
  const isRefreshingRef = useRef(false);

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

  // Rafraîchissement silencieux du token toutes les 13 minutes quand une session est active
  useEffect(() => {
    if (!user || !apiBaseUrl) return;

    const REFRESH_INTERVAL_MS = 13 * 60 * 1000;

    const timer = setInterval(async () => {
      try {
        await axios.post(`${apiBaseUrl}/auth/refresh`, {}, { withCredentials: true });
      } catch {
        // Token expiré ou révoqué — reset local sans appel logout (évite double requête)
        setUser(null);
        setToken(null);
        reset();
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [user, reset]);

  // Intercepteur axios : retente une fois après refresh en cas de 401
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error: unknown) => {
        if (!axios.isAxiosError(error)) return Promise.reject(error);

        const originalRequest = error.config as
          | (InternalAxiosRequestConfig & { _retry?: boolean })
          | undefined;

        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          !isRefreshingRef.current &&
          apiBaseUrl &&
          !originalRequest.url?.includes('/auth/login') &&
          !originalRequest.url?.includes('/auth/refresh')
        ) {
          originalRequest._retry = true;
          isRefreshingRef.current = true;
          try {
            await axios.post(`${apiBaseUrl}/auth/refresh`, {}, { withCredentials: true });
            isRefreshingRef.current = false;
            return axios(originalRequest);
          } catch {
            isRefreshingRef.current = false;
            setUser(null);
            setToken(null);
            reset();
          }
        }
        return Promise.reject(error);
      },
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    } catch (err) {
      let errorMessage = 'Connexion échouée';
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 403) {
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
