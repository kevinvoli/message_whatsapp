"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminDashboard from './dashboard/commercial/page';
import { Spinner } from './ui/Spinner';

export default function Home() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true); // Start as loading

  useEffect(() => {
    // This code runs only on the client side
    const token = localStorage.getItem('jwt_token');
    
    if (token) {
      setIsAuthenticated(true); // Set authenticated
    } else {
      router.replace('/login'); // Redirect immediately if no token
      // No need to set isAuthenticated here, as we are redirecting
      // Also, no need to setLoading(false) here, as the component will unmount
      return; // Exit early as a redirect is happening
    }
    
    setLoading(false); // Only set loading to false if we are NOT redirecting
  }, [router]); // Dependency array should include router as it's used inside

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