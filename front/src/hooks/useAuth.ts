import { useState, useEffect } from 'react';
import { Commercial } from '@/types/chat';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/';

interface LoginResponse {
  user: Commercial;
  access_token: string;
}

export const useAuth = () => {
  const [commercial, setCommercial] = useState<Commercial | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false); // 🔥 clé

  // 🔁 Restaurer la session au refresh
 useEffect(() => {
  if (typeof window === 'undefined') return;

  const storedUser = localStorage.getItem('commercial');
  const storedToken = localStorage.getItem('token');

  if (storedUser && storedToken) {
    try {
      setCommercial(JSON.parse(storedUser));
      setToken(storedToken);
    } catch {
      localStorage.removeItem('commercial');
      localStorage.removeItem('token');
    }
  }

  setInitialized(true);
}, []);

  const login = async (email: string, name: string): Promise<Commercial> => {
    setLoading(true);


    try {
      const res = await fetch(`${API_BASE_URL}users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
      name: name
    }),
      });

      if (!res.ok) {
        throw new Error('Identifiants invalides');
      }

      const data: LoginResponse = await res.json();

      console.log("repon de la request", data);
      

      setCommercial(data.user);
      setToken(data.access_token);

      // 💾 Persistance
      localStorage.setItem('commercial', JSON.stringify(data.user));
      localStorage.setItem('token', data.access_token);

      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setCommercial(null);
    setToken(null);
    localStorage.removeItem('commercial');
    localStorage.removeItem('token');
  };

  return {
    commercial,
    token,
    loading,
    initialized,
    isAuthenticated: !!commercial,
    login,
    logout,
  };
};
