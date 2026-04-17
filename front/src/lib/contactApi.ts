import axios from 'axios';
import { CallStatus } from '@/types/chat';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

export interface CrmFieldDef {
  id: string;
  name: string;
  field_key: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';
  options: string[] | null;
  required: boolean;
  position: number;
}

export interface CrmFieldVal {
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_boolean: number | null;
  value_json: string[] | null;
}

export interface CrmFieldEntry {
  definition: CrmFieldDef;
  value: CrmFieldVal | null;
}

export type CrmRawValue = string | number | boolean | string[] | null;

export async function getCrmFields(contactId: string, tenantId: string): Promise<CrmFieldEntry[]> {
  if (!apiBaseUrl) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  const r = await axios.get(`${apiBaseUrl}/contacts/${contactId}/crm-fields?tenant_id=${tenantId}`, { withCredentials: true });
  return r.data;
}

export async function setCrmFields(
  contactId: string,
  tenantId: string,
  values: Array<{ field_key: string; value: CrmRawValue }>,
): Promise<void> {
  if (!apiBaseUrl) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  await axios.post(`${apiBaseUrl}/contacts/${contactId}/crm-fields?tenant_id=${tenantId}`, { values }, { withCredentials: true });
}

export async function updateContactCallStatus(
  contactId: string,
  callStatus: CallStatus,
  notes?: string,
  outcome?: string,
  durationSec?: number,
) {
  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }

  const response = await axios.patch(
    `${apiBaseUrl}/contact/${contactId}/call-status`,
    {
      call_status:  callStatus,
      call_notes:   notes,
      outcome:      outcome,
      duration_sec: durationSec,
    },
    {
      withCredentials: true,
    },
  );

  return response.data;
}
