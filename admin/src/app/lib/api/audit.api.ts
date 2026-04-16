import { AuditLog, AuditLogPage } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getAuditLogs(params: {
  tenant_id?: string;
  actor_id?: string;
  entity_type?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogPage> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)));
  const r = await fetch(`${API_BASE_URL}/admin/audit-logs?${qs}`, { credentials: 'include' });
  return handleResponse<AuditLogPage>(r);
}

export async function getEntityAuditHistory(type: string, id: string): Promise<AuditLog[]> {
  const r = await fetch(`${API_BASE_URL}/admin/audit-logs/entity/${type}/${id}`, { credentials: 'include' });
  return handleResponse<AuditLog[]>(r);
}
