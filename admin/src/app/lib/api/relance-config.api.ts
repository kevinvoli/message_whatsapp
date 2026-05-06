import { FollowUpTemplateMappingDto } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getAutoRelanceSetting(): Promise<{ enabled: boolean }> {
  const r = await fetch(`${API_BASE_URL}/admin/settings/auto-relance`, {
    credentials: 'include',
  });
  return handleResponse<{ enabled: boolean }>(r);
}

export async function setAutoRelanceSetting(enabled: boolean): Promise<{ enabled: boolean }> {
  const r = await fetch(`${API_BASE_URL}/admin/settings/auto-relance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ enabled }),
  });
  return handleResponse<{ enabled: boolean }>(r);
}

export async function getFollowUpMappings(): Promise<FollowUpTemplateMappingDto[]> {
  const r = await fetch(`${API_BASE_URL}/follow-ups/admin/follow-up-mappings`, {
    credentials: 'include',
  });
  return handleResponse<FollowUpTemplateMappingDto[]>(r);
}

export async function upsertFollowUpMapping(
  followUpType: string,
  data: { template_id: string; template_name: string; language_code?: string },
): Promise<FollowUpTemplateMappingDto> {
  const r = await fetch(
    `${API_BASE_URL}/follow-ups/admin/follow-up-mappings/${encodeURIComponent(followUpType)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    },
  );
  return handleResponse<FollowUpTemplateMappingDto>(r);
}

export async function deleteFollowUpMapping(followUpType: string): Promise<void> {
  const r = await fetch(
    `${API_BASE_URL}/follow-ups/admin/follow-up-mappings/${encodeURIComponent(followUpType)}`,
    {
      method: 'DELETE',
      credentials: 'include',
    },
  );
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}
