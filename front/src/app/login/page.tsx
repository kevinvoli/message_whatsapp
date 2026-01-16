// app/login/page.tsx
'use client';

import LoginForm from '@/components/auth/loginForm';
import { useAuth } from '@/contexts/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { login, user, initialized, isLoading, error } = useAuth();
  const router = useRouter();

  const handleLogin = async (formData: { email: string; password: string }) => {
    try {
      await login(formData.email, formData.password);
      // La redirection se fera automatiquement via l'effet ci-dessous
    } catch (err) {
      // L'erreur est déjà gérée dans le contexte
      console.error('Login error:', err);
    }
  };

  // Rediriger si déjà connecté
  useEffect(() => {
    if (initialized && user) {
      router.replace('/whatsapp');
    }
  }, [user, initialized, router]);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <LoginForm
      onLogin={handleLogin}
      isLoading={isLoading}
      error={error}
    />
  );
}