import { API_BASE_URL, handleResponse } from './_http';

export interface SessionStats {
  commercial_id: string;
  commercial_name: string | null;
  total_sessions: number;
  total_seconds: number;
  avg_session_seconds: number;
  last_connected_at: string | null;
}

export async function getSessionStats(from?: string, to?: string): Promise<SessionStats[]> {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  const qs = p.toString() ? `?${p.toString()}` : '';
  return handleResponse<SessionStats[]>(
    await fetch(`${API_BASE_URL}/commercial-sessions/stats${qs}`, { credentials: 'include' }),
  );
}

export async function getSessionsByCommercial(
  commercialId: string,
  limit = 30,
): Promise<{ id: string; connected_at: string; disconnected_at: string | null; duration_seconds: number | null }[]> {
  return handleResponse(
    await fetch(`${API_BASE_URL}/commercial-sessions/${commercialId}?limit=${limit}`, {
      credentials: 'include',
    }),
  );
}
