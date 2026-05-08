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

export interface OrderSyncStatus {
  db2: {
    dbAvailable: boolean;
    lastSyncAt: string | null;
    processedCount: number;
  };
  syncLog: Record<string, number>;
}

export interface SyncCallsResult {
  processed: number;
  obligations: number;
  errors: number;
}

export async function getOrderSyncStatus(): Promise<OrderSyncStatus> {
  return handleResponse<OrderSyncStatus>(
    await fetch(`${API_BASE_URL}/admin/order-sync/status`, { credentials: 'include' }),
  );
}

export async function triggerSyncCalls(): Promise<SyncCallsResult> {
  return handleResponse<SyncCallsResult>(
    await fetch(`${API_BASE_URL}/admin/order-sync/sync-calls`, {
      method: 'POST',
      credentials: 'include',
    }),
  );
}

export async function triggerSyncCommercialMapping(): Promise<{ synced: number; skipped: number; errors: number }> {
  return handleResponse<{ synced: number; skipped: number; errors: number }>(
    await fetch(`${API_BASE_URL}/admin/order-sync/sync-commercial-mapping`, {
      method: 'POST',
      credentials: 'include',
    }),
  );
}

export interface CallDevice {
  id: string;
  deviceId: string;
  label: string | null;
  posteId: string | null;
  firstSeen: string;
  lastSeen: string;
  callCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function getCallDevices(): Promise<CallDevice[]> {
  return handleResponse<CallDevice[]>(
    await fetch(`${API_BASE_URL}/admin/call-devices`, { credentials: 'include' }),
  );
}

export async function updateCallDevice(
  deviceId: string,
  payload: { label?: string | null; posteId?: string | null },
): Promise<CallDevice> {
  return handleResponse<CallDevice>(
    await fetch(`${API_BASE_URL}/admin/call-devices/${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function dissociateCallDevice(deviceId: string): Promise<CallDevice> {
  return handleResponse<CallDevice>(
    await fetch(`${API_BASE_URL}/admin/call-devices/${encodeURIComponent(deviceId)}/poste`, {
      method: 'DELETE',
      credentials: 'include',
    }),
  );
}
