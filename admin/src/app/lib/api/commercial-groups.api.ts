import { CommercialGroup } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getGroups(): Promise<CommercialGroup[]> {
  return handleResponse<CommercialGroup[]>(
    await fetch(`${API_BASE_URL}/commercial-groups`, { credentials: 'include' }),
  );
}

export async function getGroup(id: string): Promise<CommercialGroup> {
  return handleResponse<CommercialGroup>(
    await fetch(`${API_BASE_URL}/commercial-groups/${id}`, { credentials: 'include' }),
  );
}

export async function createGroup(payload: { name: string; description?: string }): Promise<CommercialGroup> {
  return handleResponse<CommercialGroup>(
    await fetch(`${API_BASE_URL}/commercial-groups`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateGroup(
  id: string,
  payload: { name?: string; description?: string; isActive?: boolean },
): Promise<CommercialGroup> {
  return handleResponse<CommercialGroup>(
    await fetch(`${API_BASE_URL}/commercial-groups/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteGroup(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/commercial-groups/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export async function addMember(groupId: string, commercialId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/commercial-groups/${groupId}/members`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commercialId }),
  });
}

export async function removeMember(groupId: string, commercialId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/commercial-groups/${groupId}/members/${commercialId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}
