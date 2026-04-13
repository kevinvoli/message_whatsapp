import { CronConfig, UpdateCronConfigPayload } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export interface CronLastReport { report: string; ranAt: string }
export type CronLastReports = Record<string, CronLastReport>;

export async function getCronConfigs(): Promise<CronConfig[]> {
    const response = await fetch(`${API_BASE_URL}/cron-configs`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<CronConfig[]>(response);
}

export async function updateCronConfig(key: string, payload: UpdateCronConfigPayload): Promise<CronConfig> {
    const response = await fetch(`${API_BASE_URL}/cron-configs/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    return handleResponse<CronConfig>(response);
}

export async function resetCronConfig(key: string): Promise<CronConfig> {
    const response = await fetch(`${API_BASE_URL}/cron-configs/${key}/reset`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<CronConfig>(response);
}

export async function getCronPreview(key: string): Promise<unknown> {
    const response = await fetch(`${API_BASE_URL}/cron-configs/${key}/preview`, {
        credentials: 'include',
    });
    return handleResponse<unknown>(response);
}

export async function runCronNow(key: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/cron-configs/${key}/run`, {
        method: 'POST',
        credentials: 'include',
    });
    await handleResponse<{ ok: boolean; ranAt: string }>(response);
}

export async function getCronLastReports(): Promise<CronLastReports> {
    const response = await fetch(`${API_BASE_URL}/cron-configs/last-reports`, {
        credentials: 'include',
    });
    return handleResponse<CronLastReports>(response);
}
