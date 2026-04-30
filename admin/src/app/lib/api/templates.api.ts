import { WhatsappTemplate } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getWhatsappTemplates(tenantId?: string): Promise<WhatsappTemplate[]> {
  const params = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const r = await fetch(`${API_BASE_URL}/messages/templates${params}`, {
    credentials: 'include',
  });
  return handleResponse<WhatsappTemplate[]>(r);
}

export async function createWhatsappTemplate(data: {
  tenant_id?: string;
  channel_id?: string;
  name: string;
  category: string;
  language: string;
  body_text: string;
  header_type?: string;
  header_content?: string;
  footer_text?: string;
}): Promise<WhatsappTemplate> {
  const r = await fetch(`${API_BASE_URL}/messages/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<WhatsappTemplate>(r);
}

export async function resubmitWhatsappTemplate(id: string): Promise<WhatsappTemplate> {
  const r = await fetch(`${API_BASE_URL}/messages/templates/${id}/resubmit`, {
    method: 'PATCH',
    credentials: 'include',
  });
  return handleResponse<WhatsappTemplate>(r);
}

// Fonctions conservees pour compatibilite retroactive avec TemplatesView existant
export async function getTemplates(tenantId: string): Promise<WhatsappTemplate[]> {
  return getWhatsappTemplates(tenantId);
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
  return createWhatsappTemplate(data);
}

export async function disableTemplate(id: string, _tenantId: string): Promise<void> {
  const r = await fetch(`${API_BASE_URL}/messages/templates/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}

export async function deleteTemplate(id: string, tenantId: string): Promise<void> {
  return disableTemplate(id, tenantId);
}
