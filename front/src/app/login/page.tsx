'use client';

import { useAuth } from '@/hooks/useAuth';
import LoginForm from '@/components/auth/loginForm';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LoginFormData } from '@/types/chat';

export default function LoginPage() {
  const { login, commercial, loading } = useAuth();
  const router = useRouter();

  const handleLogin = async (formData: LoginFormData) => {
    await login(formData.email, formData.name);
    router.replace('/whatsapp');
  };

  // 🔁 si déjà connecté
  useEffect(() => {
    if (commercial) {
      router.replace('/whatsapp');
    }
  }, [commercial, router]);

  return (
    <LoginForm
      onLogin={handleLogin}
      isLoading={loading}
    />
  );
}
