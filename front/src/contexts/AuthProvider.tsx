// contexts/AuthProvider.tsx
'use client';

import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
// import { useSocket } from './SocketProvider'; // Note: SocketProvider is missing but this is the correct future import

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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // const { socket } = useSocket(); // Temporarily disabled until SocketProvider is restored

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(storedToken);
      } catch (e) {
        console.error('Failed to parse user data from localStorage', e);
        localStorage.clear();
      }
    }
    setInitialized(true);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // CORRECTED: Backend runs on port 3002
      const response = await axios.post('http://localhost:3002/auth/login', {
        email,
        password,
      });
      
      const { access_token: authToken, user: userData } = response.data;
      
      setUser(userData);
      setToken(authToken);
      localStorage.setItem('token', authToken);
      localStorage.setItem('user', JSON.stringify(userData));
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Login failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = useCallback(() => {
    // if (socket) {
    //   socket.disconnect();
    // }
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, [/* socket */]);

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