// contexts/AuthContext.tsx
'use client';

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import axios from 'axios';
import { useChatStore } from '@/store/chatStore';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  initialized: boolean;
  isLoading: boolean;
  error: string | null;
}

const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/auth/login`;

console.log(apiUrl);


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { reset } = useChatStore();

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    reset(); // Vide le store Zustand
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, [reset]);

  useEffect(() => {
    const verifyAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          // Utiliser l'URL de l'API définie dans les variables d'environnement
          const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/auth/profile`, {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          });
          setUser(response.data);
          setToken(storedToken);
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            // L'utilisateur n'existe plus, on le déconnecte
            logout();
          } else {
            console.error('Error verifying auth token:', error);
            logout(); // Déconnecter en cas d'autre erreur pour plus de sécurité
          }
        }
      }
      setInitialized(true);
    };

    verifyAuth();
  }, [logout]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Appel à votre API de login
      const response = await axios.post(apiUrl, {
        email,
        password,
      });
      console.log("mon user est connecté ici:", response);
      
      const { token: authToken, user: userData } = response.data;
      
      setUser(userData);
      setToken(authToken);
      localStorage.setItem('token', authToken);
      localStorage.setItem('user', JSON.stringify(userData));
      
    } catch (error) {
        let errorMessage = 'Login failed due to an unexpected error';
        if (axios.isAxiosError(error)) {
          // Si c'est une erreur Axios, on peut accéder à `error.response`
          errorMessage = error.response?.data?.message || 'Login failed';
        } else if (error instanceof Error) {
          // Si c'est une erreur standard
          errorMessage = error.message;
        }
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsLoading(false);
      }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      login, 
      logout, 
      initialized, 
      isLoading, 
      error 
    }}>
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