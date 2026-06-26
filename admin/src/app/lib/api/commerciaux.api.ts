import { CommercialPresenceItem } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getPresence(): Promise<CommercialPresenceItem[]> {
  return handleResponse<CommercialPresenceItem[]>(
    await fetch(`${API_BASE_URL}/commercial-groups/presence`, { credentials: 'include' }),
  );
}

export async function setWorkingToday(
  commercialId: string,
  isWorkingToday: boolean,
): Promise<CommercialPresenceItem> {
  return handleResponse<CommercialPresenceItem>(
    await fetch(`${API_BASE_URL}/commercial-groups/presence/${commercialId}/working-today`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isWorkingToday }),
    }),
  );
}
