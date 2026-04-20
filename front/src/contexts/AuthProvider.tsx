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

interface User {
  id: string;
  email: string;
  name: string;
  posteId?: string | null;
  poste_id: string;
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

const normalizeUser = (raw: User): User => ({
  ...raw,
  poste_id: raw.poste_id ?? raw.posteId ?? '',
  posteId: raw.posteId ?? raw.poste_id ?? null,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = useChatStore((s) => s.reset);

  useEffect(() => {
    const bootstrapSession = async () => {
      if (!apiBaseUrl) {
        setInitialized(true);
        return;
      }

      try {
        const response = await axios.get<User>(`${apiBaseUrl}/auth/profile`, {
          withCredentials: true,
        });
        setUser(normalizeUser(response.data));
      } catch {
        setUser(null);
      } finally {
        setInitialized(true);
      }
    };

    void bootstrapSession();
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
      const response = await axios.post<{ user: User; accessToken: string }>(
        `${apiBaseUrl}/auth/login`,
        { email, password, latitude, longitude },
        { withCredentials: true },
      );

      setUser(normalizeUser(response.data.user));
      setToken(response.data.accessToken ?? null);
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
