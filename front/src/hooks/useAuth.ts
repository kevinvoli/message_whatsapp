
import { useState, useEffect } from 'react';
import axios from 'axios';
import { LoginFormData } from '@/types/chat';

const API_URL = 'http://localhost:3001/auth';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      // You might want to fetch user profile here using the token
    }
  }, []);

  const login = async (formData: LoginFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_URL}/login`, formData);
      const { access_token } = response.data;
      setToken(access_token);
      localStorage.setItem('token', access_token);
      // Fetch user profile or decode token to get user info
      const decodedUser = JSON.parse(atob(access_token.split('.')[1]));
      setUser(decodedUser);
    } catch (err) {
      setError('Invalid email or password');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  };

  return {
    user,
    token,
    isLoading,
    error,
    login,
    logout,
    isAuthenticated: !!token,
  };
};
