// front/src/lib/api.ts
import { CommercialStatsDto } from '@/types/chat';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.replace('/login');
    }
    let errorMessage: string;
    try {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json') && response.status !== 204) {
        const errorData = await response.json();
        errorMessage = errorData.message || JSON.stringify(errorData);
      } else {
        errorMessage = response.statusText || `Erreur inconnue (${response.status})`;
      }
    } catch {
      errorMessage = response.statusText || `Erreur inconnue (${response.status})`;
    }
    throw new Error(errorMessage);
  }
  return response.json() as Promise<T>;
}

/** Récupère les stats d'activité du commercial connecté. */
export async function getCommercialStats(commercialId: string): Promise<CommercialStatsDto> {
  const response = await fetch(`${API_BASE_URL}/auth/me/stats`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<CommercialStatsDto>(response);
}
