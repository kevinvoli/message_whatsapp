import { Role, Permission } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getRoles(tenantId: string): Promise<Role[]> {
  const r = await fetch(`${API_BASE_URL}/admin/roles?tenant_id=${tenantId}`, { credentials: 'include' });
  return handleResponse<Role[]>(r);
}

export async function createRole(data: {
  tenant_id: string;
  name: string;
  description?: string;
  permissions: Permission[];
}): Promise<Role> {
  const r = await fetch(`${API_BASE_URL}/admin/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<Role>(r);
}

export async function updateRole(id: string, tenantId: string, data: Partial<Role>): Promise<Role> {
  const r = await fetch(`${API_BASE_URL}/admin/roles/${id}?tenant_id=${tenantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<Role>(r);
}

export async function deleteRole(id: string, tenantId: string): Promise<void> {
  const r = await fetch(`${API_BASE_URL}/admin/roles/${id}?tenant_id=${tenantId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}

export async function assignRole(commercialId: string, roleId: string, tenantId: string) {
  const r = await fetch(`${API_BASE_URL}/admin/roles/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ commercial_id: commercialId, role_id: roleId, tenant_id: tenantId }),
  });
  return handleResponse(r);
}
