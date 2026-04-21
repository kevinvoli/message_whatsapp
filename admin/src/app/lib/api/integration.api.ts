import { API_BASE_URL, handleResponse } from './_http';

export interface ClientMapping {
  id: string;
  contact_id: string;
  external_id: number;
  phone_normalized?: string | null;
  createdAt: string;
}

export interface CommercialMapping {
  id: string;
  commercial_id: string;
  external_id: number;
  commercial_name?: string | null;
  createdAt: string;
}

export async function getClientMappings(): Promise<ClientMapping[]> {
  return handleResponse<ClientMapping[]>(
    await fetch(`${API_BASE_URL}/integration/mappings/clients`, { credentials: 'include' }),
  );
}

export async function upsertClientMapping(payload: {
  contact_id: string;
  external_id: number;
  phone?: string;
}): Promise<ClientMapping> {
  return handleResponse<ClientMapping>(
    await fetch(`${API_BASE_URL}/integration/mappings/clients`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteClientMapping(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/integration/mappings/clients/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export async function getCommercialMappings(): Promise<CommercialMapping[]> {
  return handleResponse<CommercialMapping[]>(
    await fetch(`${API_BASE_URL}/integration/mappings/commercials`, { credentials: 'include' }),
  );
}

export async function upsertCommercialMapping(payload: {
  commercial_id: string;
  external_id: number;
  name?: string;
}): Promise<CommercialMapping> {
  return handleResponse<CommercialMapping>(
    await fetch(`${API_BASE_URL}/integration/mappings/commercials`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteCommercialMapping(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/integration/mappings/commercials/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}
