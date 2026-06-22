import { AnalyticsSummary, AnalyticsConversationDay, AnalyticsAgent, AnalyticsChannel } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';

interface AnalyticsParams {
  dateFrom?: string;
  dateTo?: string;
}

export async function getAnalyticsSummary(params: AnalyticsParams): Promise<AnalyticsSummary> {
  const query = new URLSearchParams({ tenant_id: TENANT_ID });
  if (params.dateFrom) query.set('from', params.dateFrom);
  if (params.dateTo) query.set('to', params.dateTo);
  const response = await fetch(`${API_BASE_URL}/admin/analytics/summary?${query.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<AnalyticsSummary>(response);
}

export async function getAnalyticsConversations(params: AnalyticsParams): Promise<AnalyticsConversationDay[]> {
  const query = new URLSearchParams({ tenant_id: TENANT_ID });
  if (params.dateFrom) query.set('from', params.dateFrom);
  if (params.dateTo) query.set('to', params.dateTo);
  const response = await fetch(`${API_BASE_URL}/admin/analytics/conversations?${query.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<AnalyticsConversationDay[]>(response);
}

export async function getAnalyticsAgents(params: AnalyticsParams): Promise<AnalyticsAgent[]> {
  const query = new URLSearchParams({ tenant_id: TENANT_ID });
  if (params.dateFrom) query.set('from', params.dateFrom);
  if (params.dateTo) query.set('to', params.dateTo);
  const response = await fetch(`${API_BASE_URL}/admin/analytics/agents?${query.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<AnalyticsAgent[]>(response);
}

export async function getAnalyticsChannels(params: AnalyticsParams): Promise<AnalyticsChannel[]> {
  const query = new URLSearchParams({ tenant_id: TENANT_ID });
  if (params.dateFrom) query.set('from', params.dateFrom);
  if (params.dateTo) query.set('to', params.dateTo);
  const response = await fetch(`${API_BASE_URL}/admin/analytics/channels?${query.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<AnalyticsChannel[]>(response);
}
