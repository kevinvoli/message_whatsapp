import { FollowUp, FollowUpStatus } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export interface FollowUpsAdminParams {
  status?: FollowUpStatus;
  commercial_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function getFollowUpsAdmin(
  params: FollowUpsAdminParams = {},
): Promise<{ data: FollowUp[]; total: number }> {
  const p = new URLSearchParams();
  if (params.status) p.set('status', params.status);
  if (params.commercial_id) p.set('commercial_id', params.commercial_id);
  if (params.from) p.set('from', params.from);
  if (params.to) p.set('to', params.to);
  if (params.limit != null) p.set('limit', String(params.limit));
  if (params.offset != null) p.set('offset', String(params.offset));
  const response = await fetch(`${API_BASE_URL}/follow-ups/admin?${p.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<{ data: FollowUp[]; total: number }>(response);
}

export async function getDueTodayAdmin(): Promise<FollowUp[]> {
  const response = await fetch(`${API_BASE_URL}/follow-ups/due-today`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<FollowUp[]>(response);
}

export async function getOverdueFollowUps(): Promise<FollowUp[]> {
  const response = await fetch(`${API_BASE_URL}/follow-ups/admin?status=en_retard&limit=100`, {
    method: 'GET',
    credentials: 'include',
  });
  const result = await handleResponse<{ data: FollowUp[]; total: number }>(response);
  return result.data;
}

export async function getFollowUpsByContactAdmin(contactId: string): Promise<FollowUp[]> {
  const response = await fetch(`${API_BASE_URL}/follow-ups/by-contact/${contactId}`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<FollowUp[]>(response);
}

export async function completeFollowUpAdmin(
  id: string,
  data: { result?: string; notes?: string },
): Promise<FollowUp> {
  const response = await fetch(`${API_BASE_URL}/follow-ups/${id}/complete`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse<FollowUp>(response);
}

export async function cancelFollowUpAdmin(id: string): Promise<FollowUp> {
  const response = await fetch(`${API_BASE_URL}/follow-ups/${id}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    credentials: 'include',
  });
  return handleResponse<FollowUp>(response);
}
