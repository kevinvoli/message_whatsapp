import { ContactFieldDefinition, ContactCrmField } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getCrmFields(tenantId: string): Promise<ContactFieldDefinition[]> {
  const r = await fetch(`${API_BASE_URL}/admin/crm/fields?tenant_id=${tenantId}`, { credentials: 'include' });
  return handleResponse<ContactFieldDefinition[]>(r);
}

export async function createCrmField(data: {
  tenant_id: string;
  name: string;
  field_key: string;
  field_type?: string;
  options?: string[] | null;
  required?: boolean;
  position?: number;
}): Promise<ContactFieldDefinition> {
  const r = await fetch(`${API_BASE_URL}/admin/crm/fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<ContactFieldDefinition>(r);
}

export async function updateCrmField(
  id: string,
  tenantId: string,
  data: Partial<{ name: string; options: string[] | null; required: boolean; position: number }>,
): Promise<ContactFieldDefinition> {
  const r = await fetch(`${API_BASE_URL}/admin/crm/fields/${id}?tenant_id=${tenantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<ContactFieldDefinition>(r);
}

export async function deleteCrmField(id: string, tenantId: string): Promise<void> {
  const r = await fetch(`${API_BASE_URL}/admin/crm/fields/${id}?tenant_id=${tenantId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}

export async function getContactCrmFields(contactId: string, tenantId: string): Promise<ContactCrmField[]> {
  const r = await fetch(
    `${API_BASE_URL}/admin/contacts/${contactId}/crm-fields?tenant_id=${tenantId}`,
    { credentials: 'include' },
  );
  return handleResponse<ContactCrmField[]>(r);
}

export async function setContactCrmFields(
  contactId: string,
  tenantId: string,
  values: Array<{ field_key: string; value: string | number | boolean | string[] | null }>,
): Promise<void> {
  const r = await fetch(
    `${API_BASE_URL}/admin/contacts/${contactId}/crm-fields?tenant_id=${tenantId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ values }),
    },
  );
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
}
