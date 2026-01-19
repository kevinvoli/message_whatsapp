'use client';

import { useAuth } from '@/context/AuthProvider';
import LoginForm from '@/components/auth/loginForm';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LoginFormData } from '@/types/chat';

export default function LoginPage() {
  console.log("Rendering LoginPage");
  const { login, user, token } = useAuth();
  const router = useRouter();

  const handleLogin = async (formData: LoginFormData) => {
    // Note: The login function in AuthProvider expects userData and token.
    // You'll need to adapt this to your actual API response.
    // For now, we'll just simulate a login.
    const mockUserData = { id: 1, email: formData.email };
    const mockToken = 'fake-jwt-token';
    login(mockUserData, mockToken);
    router.replace('/whatsapp');
  };

  // 🔁 si déjà connecté
  useEffect(() => {
    if (user) {
      router.replace('/whatsapp');
    }
  }, [user, router]);

  return (
    <LoginForm
      onLogin={handleLogin}
      isLoading={false} // You might want to add loading state to your AuthProvider
    />
  );
}
