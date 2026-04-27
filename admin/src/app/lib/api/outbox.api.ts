import { API_BASE_URL, handleResponse } from './_http';

export interface OutboxStats {
  pending:    number;
  processing: number;
  success:    number;
  failed:     number;
}

export interface OutboxEntry {
  id:           string;
  eventType:    string;
  entityId:     string;
  status:       string;
  attemptCount: number;
  lastError:    string | null;
  nextRetryAt:  string | null;
  createdAt:    string;
  processedAt:  string | null;
}

export interface OutboxStatsResponse {
  stats:             OutboxStats;
  stalePendingCount: number;
}

export interface OutboxFailedResponse {
  data:  OutboxEntry[];
  total: number;
}

export async function getOutboxStats(): Promise<OutboxStatsResponse> {
  const res = await fetch(`${API_BASE_URL}/admin/outbox/stats`, { credentials: 'include' });
  return handleResponse<OutboxStatsResponse>(res);
}

export async function getOutboxFailed(limit = 50, offset = 0): Promise<OutboxFailedResponse> {
  const res = await fetch(`${API_BASE_URL}/admin/outbox/failed?limit=${limit}&offset=${offset}`, { credentials: 'include' });
  return handleResponse<OutboxFailedResponse>(res);
}

export async function retryOutboxEntry(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/admin/outbox/${id}/retry`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<{ success: boolean }>(res);
}
