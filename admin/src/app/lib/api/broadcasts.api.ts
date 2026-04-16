import { Broadcast } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getBroadcasts(tenantId: string): Promise<Broadcast[]> {
  const r = await fetch(`${API_BASE_URL}/admin/broadcasts?tenant_id=${tenantId}`, { credentials: 'include' });
  return handleResponse<Broadcast[]>(r);
}

export async function createBroadcast(data: {
  tenant_id: string;
  name: string;
  template_id?: string;
  scheduled_at?: string;
}): Promise<Broadcast> {
  const r = await fetch(`${API_BASE_URL}/admin/broadcasts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<Broadcast>(r);
}

export async function launchBroadcast(id: string, tenantId: string): Promise<Broadcast> {
  const r = await fetch(`${API_BASE_URL}/admin/broadcasts/${id}/launch?tenant_id=${tenantId}`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<Broadcast>(r);
}

export async function pauseBroadcast(id: string, tenantId: string): Promise<Broadcast> {
  const r = await fetch(`${API_BASE_URL}/admin/broadcasts/${id}/pause?tenant_id=${tenantId}`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<Broadcast>(r);
}

export async function cancelBroadcast(id: string, tenantId: string): Promise<void> {
  const r = await fetch(`${API_BASE_URL}/admin/broadcasts/${id}/cancel?tenant_id=${tenantId}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}

export async function getBroadcastStats(id: string): Promise<Broadcast> {
  const r = await fetch(`${API_BASE_URL}/admin/broadcasts/${id}/stats`, { credentials: 'include' });
  return handleResponse<Broadcast>(r);
}
