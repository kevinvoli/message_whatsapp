import { WhatsappTemplate } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getWhatsappTemplates(channelId: string, status?: string): Promise<WhatsappTemplate[]> {
  const params = new URLSearchParams({ channel_id: channelId });
  if (status) params.set('status', status);
  const r = await fetch(`${API_BASE_URL}/messages/templates?${params.toString()}`, {
    credentials: 'include',
  });
  return handleResponse<WhatsappTemplate[]>(r);
}

export async function createWhatsappTemplate(payload: {
  channelId: string;
  name: string;
  language?: string;
  category?: string;
  components?: any;
  externalId?: string;
}): Promise<WhatsappTemplate> {
  const r = await fetch(`${API_BASE_URL}/messages/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<WhatsappTemplate>(r);
}

export async function resubmitWhatsappTemplate(
  id: string,
  updates?: { name?: string; language?: string; category?: string; components?: any },
): Promise<WhatsappTemplate> {
  const r = await fetch(`${API_BASE_URL}/messages/templates/${id}/resubmit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: updates ? JSON.stringify(updates) : undefined,
  });
  return handleResponse<WhatsappTemplate>(r);
}

