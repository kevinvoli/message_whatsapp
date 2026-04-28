import { API_BASE_URL, handleResponse } from './_http';

export interface LoginLogEntry {
  id:           string;
  userId:       string;
  userName:     string | null;
  posteId:      string | null;
  ip:           string | null;
  device:       string | null;
  localisation: string | null;
  otpStatus:    'none' | 'sent' | 'verified' | 'failed';
  loginAt:      string;
}

export interface LoginLogsResponse {
  data:  LoginLogEntry[];
  total: number;
}

export async function getLoginLogs(params?: {
  user_id?: string;
  limit?:   number;
  offset?:  number;
}): Promise<LoginLogsResponse> {
  const q = new URLSearchParams();
  if (params?.user_id) q.set('user_id', params.user_id);
  if (params?.limit  != null) q.set('limit',  String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  const r = await fetch(`${API_BASE_URL}/admin/login-logs?${q}`, { credentials: 'include' });
  return handleResponse<LoginLogsResponse>(r);
}

export async function purgeLoginLogs(days = 90): Promise<{ deleted: number }> {
  const r = await fetch(`${API_BASE_URL}/admin/login-logs/purge?days=${days}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse<{ deleted: number }>(r);
}
