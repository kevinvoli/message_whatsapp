import { API_BASE_URL, handleResponse } from './_http';

export interface CapacitySummaryEntry {
  posteId: string;
  posteName: string;
  activeCount: number;
  validatedCount: number;
  lockedCount: number;
  totalCount: number;
  quotaActive: number;
  quotaTotal: number;
}

export interface CapacityConfig {
  quotaActive: number;
  quotaTotal: number;
}

export async function getCapacitySummary(): Promise<CapacitySummaryEntry[]> {
  return handleResponse<CapacitySummaryEntry[]>(
    await fetch(`${API_BASE_URL}/capacity/summary`, { credentials: 'include' }),
  );
}

export async function getCapacityConfig(): Promise<CapacityConfig> {
  return handleResponse<CapacityConfig>(
    await fetch(`${API_BASE_URL}/capacity/config`, { credentials: 'include' }),
  );
}

export async function setCapacityConfig(config: CapacityConfig): Promise<void> {
  await fetch(`${API_BASE_URL}/capacity/config`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function forceUnlock(chatId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/capacity/unlock/${chatId}`, {
    method: 'PATCH',
    credentials: 'include',
  });
}

export async function getWindowMode(): Promise<{ enabled: boolean; threshold: number }> {
  return handleResponse<{ enabled: boolean; threshold: number }>(
    await fetch(`${API_BASE_URL}/capacity/window-mode`, { credentials: 'include' }),
  );
}

export async function setWindowMode(patch: { enabled?: boolean; threshold?: number }): Promise<{ enabled: boolean; threshold: number }> {
  return handleResponse<{ enabled: boolean; threshold: number }>(
    await fetch(`${API_BASE_URL}/capacity/window-mode`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  );
}
