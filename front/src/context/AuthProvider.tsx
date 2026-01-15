'use client';
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }:{ children:React.ReactNode }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
   const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


   const storeAuthData = useCallback((response: LoginResponse) => {
    try {
      setUser(response.user);
      setRefreshToken(response.refreshToken);
      
      // Utilisation de sessionStorage pour une meilleure sécurité
      sessionStorage.setItem('authToken', response.token);
      sessionStorage.setItem('refreshToken', response.refreshToken);
      sessionStorage.setItem('userData', JSON.stringify(response.user));
    } catch (err) {
      console.error("Storage error:", err);
      throw new Error("Failed to store authentication data");
    }
  }, []);
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      // You might want to fetch user data here based on the token
    }
  }, []);

  const login = (userData, token) => {
    setUser(userData);
    setToken(token);
    localStorage.setItem('token', token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
