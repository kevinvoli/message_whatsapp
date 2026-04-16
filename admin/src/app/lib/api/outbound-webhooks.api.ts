import { OutboundWebhook, OutboundWebhookLog } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getWebhooks(tenantId: string): Promise<OutboundWebhook[]> {
  const r = await fetch(`${API_BASE_URL}/admin/outbound-webhooks?tenant_id=${tenantId}`, { credentials: 'include' });
  return handleResponse<OutboundWebhook[]>(r);
}

export async function createWebhook(data: {
  tenant_id: string;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  max_retries?: number;
}): Promise<OutboundWebhook> {
  const r = await fetch(`${API_BASE_URL}/admin/outbound-webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<OutboundWebhook>(r);
}

export async function updateWebhook(id: string, tenantId: string, data: Partial<OutboundWebhook>): Promise<OutboundWebhook> {
  const r = await fetch(`${API_BASE_URL}/admin/outbound-webhooks/${id}?tenant_id=${tenantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<OutboundWebhook>(r);
}

export async function deleteWebhook(id: string, tenantId: string): Promise<void> {
  const r = await fetch(`${API_BASE_URL}/admin/outbound-webhooks/${id}?tenant_id=${tenantId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}

export async function getWebhookLogs(id: string): Promise<OutboundWebhookLog[]> {
  const r = await fetch(`${API_BASE_URL}/admin/outbound-webhooks/${id}/logs`, { credentials: 'include' });
  return handleResponse<OutboundWebhookLog[]>(r);
}

export async function testWebhook(id: string, tenantId: string): Promise<{ status: number | null; error: string | null }> {
  const r = await fetch(`${API_BASE_URL}/admin/outbound-webhooks/${id}/test?tenant_id=${tenantId}`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse(r);
}
