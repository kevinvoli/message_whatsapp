'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

export default function AutoConnexionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const username = searchParams.get('username');

    if (!username || !apiBaseUrl) {
      router.replace('/login');
      return;
    }

    axios
      .post(
        `${apiBaseUrl}/auth/auto-login`,
        { username },
        { withCredentials: true },
      )
      .then(() => {
        window.location.replace('/whatsapp');
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
    </div>
  );
}
