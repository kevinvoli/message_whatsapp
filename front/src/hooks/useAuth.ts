import { useState } from 'react';
import { Commercial } from '@/types/chat';

export const useAuth = () => {
  const [commercial, setCommercial] = useState<Commercial | null>(null);

  const login = (email: string, password: string): Promise<Commercial> => {
    return new Promise((resolve) => {
      // Simulation de connexion
      const mockCommercial: Commercial = {
        id: 'comm_' + Date.now(),
        name: 'Commercial Demo',
        email: email,
        token: 'mock_token_' + Date.now()
      };
      setCommercial(mockCommercial);
      resolve(mockCommercial);
    });
  };

  const logout = () => {
    setCommercial(null);
  };

  return { commercial, login, logout };
};