import { NextResponse } from 'next/server';

// URL de base de votre API backend NestJS
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:4000';

/**
 * @route GET /api/channel
 * @description Récupère la liste de tous les canaux depuis le backend.
 */
export async function GET() {
  try {
    const response = await fetch(`${BACKEND_API_URL}/channel`, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Important pour toujours avoir les données à jour
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({ message: 'Failed to fetch channels from backend', error: errorData }, { status: response.status });
    }

    const channels = await response.json();
    return NextResponse.json(channels);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: 'Internal Server Error', error: errorMessage }, { status: 500 });
  }
}

/**
 * @route POST /api/channel
 * @description Crée un nouveau canal en envoyant une requête au backend.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = body.token;

    if (!token) {
      return NextResponse.json({ message: 'Token is required' }, { status: 400 });
    }

    const response = await fetch(`${BACKEND_API_URL}/channel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({ message: 'Failed to create channel in backend', error: errorData }, { status: response.status });
    }

    const newChannel = await response.json();
    return NextResponse.json(newChannel, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ message: 'Internal Server Error', error: errorMessage }, { status: 500 });
  }
}
