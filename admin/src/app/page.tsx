"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminDashboard from './dashboard/commercial/page';
import { Spinner } from './ui/Spinner';
import { checkAdminAuth } from './lib/api'; // Import checkAdminAuth

export default function Home() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true); // Start as loading

  useEffect(() => {
    async function checkAuthStatus() {
      try {
        const authenticated = await checkAdminAuth();
        if (authenticated) {
          setIsAuthenticated(true);
        } else {
          router.replace('/login');
        }
      } catch (error) {
        console.error("Authentication check failed:", error);
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    }

    checkAuthStatus();
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

  // If not loading and not authenticated (meaning, redirected or an edge case), return null
  return null; 
}