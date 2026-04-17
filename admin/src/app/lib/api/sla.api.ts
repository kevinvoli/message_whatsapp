import { SlaRule, SlaViolation } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getSlaRules(tenantId: string): Promise<SlaRule[]> {
  const r = await fetch(`${API_BASE_URL}/admin/sla-rules?tenant_id=${tenantId}`, { credentials: 'include' });
  return handleResponse<SlaRule[]>(r);
}

export async function createSlaRule(data: {
  tenant_id: string;
  name: string;
  metric: string;
  threshold_seconds: number;
  severity?: string;
  notify_admin?: boolean;
}): Promise<SlaRule> {
  const r = await fetch(`${API_BASE_URL}/admin/sla-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<SlaRule>(r);
}

export async function updateSlaRule(id: string, tenantId: string, data: Partial<SlaRule>): Promise<SlaRule> {
  const r = await fetch(`${API_BASE_URL}/admin/sla-rules/${id}?tenant_id=${tenantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<SlaRule>(r);
}

export async function deleteSlaRule(id: string, tenantId: string): Promise<void> {
  const r = await fetch(`${API_BASE_URL}/admin/sla-rules/${id}?tenant_id=${tenantId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}

export async function getSlaViolations(tenantId: string): Promise<SlaViolation[]> {
  const r = await fetch(`${API_BASE_URL}/admin/sla-rules/violations?tenant_id=${tenantId}`, { credentials: 'include' });
  return handleResponse<SlaViolation[]>(r);
}
