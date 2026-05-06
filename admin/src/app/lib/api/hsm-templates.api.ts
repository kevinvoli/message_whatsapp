import { HsmTemplate, TemplateBaseModel } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getHsmTemplates(
  tenantId: string,
  filters?: { status?: string; category?: string },
): Promise<HsmTemplate[]> {
  const params = new URLSearchParams({ tenant_id: tenantId });
  if (filters?.status) params.set('status', filters.status);
  if (filters?.category) params.set('category', filters.category);
  const r = await fetch(`${API_BASE_URL}/admin/templates?${params.toString()}`, {
    credentials: 'include',
  });
  return handleResponse<HsmTemplate[]>(r);
}

export async function getHsmTemplate(id: string, tenantId: string): Promise<HsmTemplate> {
  const r = await fetch(`${API_BASE_URL}/admin/templates/${id}?tenant_id=${tenantId}`, {
    credentials: 'include',
  });
  return handleResponse<HsmTemplate>(r);
}

export async function getTemplateBaseModels(): Promise<TemplateBaseModel[]> {
  const r = await fetch(`${API_BASE_URL}/admin/templates/base-models`, {
    credentials: 'include',
  });
  return handleResponse<TemplateBaseModel[]>(r);
}

export async function createHsmTemplate(data: Partial<HsmTemplate>): Promise<HsmTemplate> {
  const r = await fetch(`${API_BASE_URL}/admin/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<HsmTemplate>(r);
}

export async function updateHsmTemplate(
  id: string,
  data: Partial<HsmTemplate>,
): Promise<HsmTemplate> {
  const r = await fetch(`${API_BASE_URL}/admin/templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<HsmTemplate>(r);
}

export async function submitHsmTemplate(id: string, tenantId: string): Promise<HsmTemplate> {
  const r = await fetch(`${API_BASE_URL}/admin/templates/${id}/submit?tenant_id=${tenantId}`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<HsmTemplate>(r);
}

export async function deleteHsmTemplate(id: string, tenantId: string): Promise<void> {
  const r = await fetch(`${API_BASE_URL}/admin/templates/${id}?tenant_id=${tenantId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}
