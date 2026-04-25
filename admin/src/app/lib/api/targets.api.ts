import { API_BASE_URL, handleResponse } from './_http';

export interface CommercialTarget {
  id: string;
  commercial_id: string;
  commercial_name?: string | null;
  period_type: 'day' | 'week' | 'month' | 'quarter';
  period_start: string;
  metric: 'conversations' | 'calls' | 'follow_ups' | 'orders' | 'relances' | 'reports_submitted';
  target_value: number;
  created_by?: string | null;
  createdAt: string;
}

export interface TargetProgress {
  target: CommercialTarget;
  current_value: number;
  progress_pct: number;
  period_label: string;
}

export interface CreateTargetPayload {
  commercial_id: string;
  commercial_name?: string;
  period_type: CommercialTarget['period_type'];
  period_start: string;
  metric: CommercialTarget['metric'];
  target_value: number;
}

export async function getTargets(commercial_id?: string): Promise<CommercialTarget[]> {
  const p = commercial_id ? `?commercial_id=${commercial_id}` : '';
  return handleResponse<CommercialTarget[]>(
    await fetch(`${API_BASE_URL}/targets${p}`, { credentials: 'include' }),
  );
}

export async function getProgressAll(): Promise<TargetProgress[]> {
  return handleResponse<TargetProgress[]>(
    await fetch(`${API_BASE_URL}/targets/progress/all`, { credentials: 'include' }),
  );
}

export async function createTarget(payload: CreateTargetPayload): Promise<CommercialTarget> {
  return handleResponse<CommercialTarget>(
    await fetch(`${API_BASE_URL}/targets`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateTarget(id: string, payload: Partial<CreateTargetPayload>): Promise<CommercialTarget> {
  return handleResponse<CommercialTarget>(
    await fetch(`${API_BASE_URL}/targets/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteTarget(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/targets/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}
