import axios from 'axios';
import { CallStatus } from '@/types/chat';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

// ── Client / Dossier ───────────────────────────────────────────────────────────

export interface ClientSummary {
  id: string;
  chat_id: string;
  name: string;
  phone: string;
  source?: string | null;
  client_category?: string | null;
  order_client_id?: string | null;
  referral_code?: string | null;
  referral_count?: number | null;
  referral_commission?: number | null;
  portfolio_owner_id?: string | null;
  call_status?: string | null;
  last_call_date?: string | null;
  total_messages?: number;
  call_count?: number;
  conversation_count?: number;
  next_follow_up?: {
    id: string;
    type: string;
    scheduled_at: string;
    status: string;
  } | null;
}

export interface DossierStats {
  total_conversations: number;
  total_messages: number;
  total_calls: number;
  last_contact_at?: string | null;
  next_follow_up?: ClientSummary['next_follow_up'];
}

export interface ClientDossier {
  contact: ClientSummary;
  stats: DossierStats;
  follow_ups: import('@/types/chat').FollowUp[];
  call_logs: Array<{
    id: string;
    status: string;
    notes?: string | null;
    outcome?: string | null;
    duration_sec?: number | null;
    createdAt: string;
  }>;
  conversations: Array<{
    id: string;
    status: string;
    conversation_result?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface TimelineEvent {
  type: 'call' | 'follow_up' | 'conversation_opened' | 'conversation_closed';
  date: string;
  detail: Record<string, unknown>;
}

export async function searchClients(params: {
  search?: string;
  my_portfolio?: boolean;
  client_category?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: ClientSummary[]; total: number }> {
  if (!apiBaseUrl) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  const query = new URLSearchParams();
  if (params.search)        query.set('search', params.search);
  if (params.my_portfolio)  query.set('my_portfolio', 'true');
  if (params.client_category) query.set('client_category', params.client_category);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.offset != null) query.set('offset', String(params.offset));
  const r = await axios.get(`${apiBaseUrl}/clients?${query}`, { withCredentials: true });
  return r.data;
}

export async function getClientDossier(contactId: string): Promise<ClientDossier> {
  if (!apiBaseUrl) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  const r = await axios.get(`${apiBaseUrl}/clients/${contactId}/dossier`, { withCredentials: true });
  return r.data;
}

export async function getClientTimeline(contactId: string, limit = 30): Promise<TimelineEvent[]> {
  if (!apiBaseUrl) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  const r = await axios.get(`${apiBaseUrl}/clients/${contactId}/timeline?limit=${limit}`, { withCredentials: true });
  return r.data;
}

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
