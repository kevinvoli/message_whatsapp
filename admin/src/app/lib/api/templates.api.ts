import { WhatsappTemplate } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getTemplates(tenantId: string): Promise<WhatsappTemplate[]> {
  const r = await fetch(`${API_BASE_URL}/admin/templates?tenant_id=${tenantId}`, { credentials: 'include' });
  return handleResponse<WhatsappTemplate[]>(r);
}

export async function createTemplate(data: {
  tenant_id: string;
  channel_id?: string;
  name: string;
  category: string;
  language: string;
  body_text: string;
  header_type?: string;
  header_content?: string;
  footer_text?: string;
}): Promise<WhatsappTemplate> {
  const r = await fetch(`${API_BASE_URL}/admin/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<WhatsappTemplate>(r);
}

export async function disableTemplate(id: string, tenantId: string): Promise<void> {
  const r = await fetch(`${API_BASE_URL}/admin/templates/${id}?tenant_id=${tenantId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}

export async function deleteTemplate(id: string, tenantId: string): Promise<void> {
  const r = await fetch(`${API_BASE_URL}/admin/templates/${id}?tenant_id=${tenantId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}
