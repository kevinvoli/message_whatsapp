import { API_BASE_URL, handleResponse } from './_http';

export interface AllowedLocation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  createdAt: string;
}

export interface CreateLocationPayload {
  label: string;
  latitude: number;
  longitude: number;
  radius_km?: number;
}

export async function getLocations(): Promise<AllowedLocation[]> {
  return handleResponse<AllowedLocation[]>(
    await fetch(`${API_BASE_URL}/geo-access`, { credentials: 'include' }),
  );
}

export async function createLocation(payload: CreateLocationPayload): Promise<AllowedLocation> {
  return handleResponse<AllowedLocation>(
    await fetch(`${API_BASE_URL}/geo-access`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateLocation(
  id: string,
  payload: Partial<CreateLocationPayload>,
): Promise<AllowedLocation> {
  return handleResponse<AllowedLocation>(
    await fetch(`${API_BASE_URL}/geo-access/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteLocation(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/geo-access/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export async function setPosteIpExempt(id: string, exempt: boolean): Promise<void> {
  await fetch(`${API_BASE_URL}/geo-access/postes/${id}/exempt`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exempt }),
  });
}

export async function setCommercialIpExempt(id: string, exempt: boolean): Promise<void> {
  await fetch(`${API_BASE_URL}/geo-access/commerciaux/${id}/exempt`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exempt }),
  });
}
