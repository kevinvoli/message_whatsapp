import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export async function middleware(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') ?? '';
    const res = await fetch(`${API_BASE_URL}/quiz/today`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.sessionActive && !data.isExempt && !data.attemptCompleted) {
        return NextResponse.redirect(new URL('/quiz', request.url));
      }
    }
  } catch {
    // Erreur réseau : ne pas bloquer l'accès
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/whatsapp/:path*'],
};
