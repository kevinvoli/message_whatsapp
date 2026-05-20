import { MessagingApplication } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getApplications(): Promise<MessagingApplication[]> {
  const response = await fetch(`${API_BASE_URL}/applications`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<MessagingApplication[]>(response);
}

export async function createApplication(data: {
  label: string;
  provider?: string;
  appId: string;
  appSecret: string;
  systemToken?: string;
}): Promise<MessagingApplication> {
  const response = await fetch(`${API_BASE_URL}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse<MessagingApplication>(response);
}

export async function updateApplication(
  id: string,
  data: Partial<{
    label: string;
    provider: string;
    appId: string;
    appSecret: string;
    systemToken: string;
  }>,
): Promise<MessagingApplication> {
  const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse<MessagingApplication>(response);
}

export async function deleteApplication(id: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse<{ message: string }>(response);
}

export async function getApplicationChannels(id: string): Promise<import('../definitions').Channel[]> {
  const response = await fetch(`${API_BASE_URL}/applications/${id}/channels`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<import('../definitions').Channel[]>(response);
}
