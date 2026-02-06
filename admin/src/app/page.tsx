"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminDashboard from './dashboard/commercial/page';
import { Spinner } from './ui/Spinner';

export default function Home() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // This code runs only on the client side
    const token = localStorage.getItem('jwt_token');
    if (token) {
      setIsAuthenticated(true);
    } else {
      router.replace('/login');
    }
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isAuthenticated) {
    return <AdminDashboard />;
  }

  return null; // Affiche une page vide pendant que la redirection s'effectue
}