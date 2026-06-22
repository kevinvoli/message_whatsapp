import { GdprOptout } from '@/app/lib/definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getGdprOptouts(): Promise<GdprOptout[]> {
  return handleResponse<GdprOptout[]>(
    await fetch(`${API_BASE_URL}/admin/gdpr/optout`, { credentials: 'include' }),
  );
}

export async function anonymizeGdprOptout(phone: string): Promise<void> {
  await handleResponse<void>(
    await fetch(`${API_BASE_URL}/admin/gdpr/optout/${encodeURIComponent(phone)}/anonymize`, {
      method: 'DELETE',
      credentials: 'include',
    }),
  );
}

export async function revokeGdprOptout(phone: string): Promise<void> {
  await handleResponse<void>(
    await fetch(`${API_BASE_URL}/admin/gdpr/optout/${encodeURIComponent(phone)}`, {
      method: 'DELETE',
      credentials: 'include',
    }),
  );
}
