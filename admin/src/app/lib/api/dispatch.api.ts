import { QueuePosition, DispatchSnapshot, DispatchSettings, DispatchSettingsAudit } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getQueue(): Promise<QueuePosition[]> {
    const response = await fetch(`${API_BASE_URL}/queue`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<QueuePosition[]>(response);
}

export async function getDispatchSnapshot(): Promise<DispatchSnapshot> {
    const response = await fetch(`${API_BASE_URL}/queue/dispatch`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<DispatchSnapshot>(response);
}

export async function getDispatchSettings(): Promise<DispatchSettings> {
    const response = await fetch(`${API_BASE_URL}/queue/dispatch/settings`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<DispatchSettings>(response);
}

export async function updateDispatchSettings(payload: Partial<DispatchSettings>): Promise<DispatchSettings> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, createdAt, updatedAt, ...cleanPayload } = payload as DispatchSettings & { id?: string; createdAt?: unknown; updatedAt?: unknown };
    const response = await fetch(`${API_BASE_URL}/queue/dispatch/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanPayload),
        credentials: 'include',
    });
    return handleResponse<DispatchSettings>(response);
}

export async function resetDispatchSettings(): Promise<DispatchSettings> {
    const response = await fetch(`${API_BASE_URL}/queue/dispatch/settings/reset`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<DispatchSettings>(response);
}

export async function getDispatchSettingsAudit(
    params: { limit?: number; offset?: number; resetOnly?: boolean; q?: string; from?: string; to?: string } = {},
): Promise<DispatchSettingsAudit[]> {
    const { limit = 50, offset = 0, resetOnly = false, q = '', from = '', to = '' } = params;
    const response = await fetch(
        `${API_BASE_URL}/queue/dispatch/settings/audit?limit=${limit}&offset=${offset}&reset_only=${resetOnly}&q=${encodeURIComponent(q)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { method: 'GET', credentials: 'include' },
    );
    return handleResponse<DispatchSettingsAudit[]>(response);
}

export async function getDispatchSettingsAuditPage(
    params: { page?: number; limit?: number; resetOnly?: boolean; q?: string; from?: string; to?: string } = {},
): Promise<{ data: DispatchSettingsAudit[]; total: number }> {
    const { page = 1, limit = 50, resetOnly = false, q = '', from = '', to = '' } = params;
    const response = await fetch(
        `${API_BASE_URL}/queue/dispatch/settings/audit/page?page=${page}&limit=${limit}&reset_only=${resetOnly}&q=${encodeURIComponent(q)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { method: 'GET', credentials: 'include' },
    );
    return handleResponse<{ data: DispatchSettingsAudit[]; total: number }>(response);
}

export async function redispatchAllWaiting(): Promise<{ dispatched: number; still_waiting: number }> {
    const response = await fetch(`${API_BASE_URL}/queue/dispatch/redispatch-all`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ dispatched: number; still_waiting: number }>(response);
}

export async function resetStuckConversations(): Promise<{ reset: number }> {
    const response = await fetch(`${API_BASE_URL}/queue/dispatch/reset-stuck`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ reset: number }>(response);
}

export async function resetQueue(): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/queue/reset`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function blockPosteFromQueue(posteId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/queue/block/${posteId}`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function unblockPosteFromQueue(posteId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/queue/unblock/${posteId}`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ success: boolean }>(response);
}

// S2-006 — Capacité + affinités
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

export interface AffinityStatEntry {
    posteId: string;
    count: number;
    topChatIds: string[];
}

export async function getCapacitySummary(): Promise<CapacitySummaryEntry[]> {
    const response = await fetch(`${API_BASE_URL}/capacity/summary`, {
        credentials: 'include',
    });
    return handleResponse<CapacitySummaryEntry[]>(response);
}

export async function getAffinityStats(): Promise<AffinityStatEntry[]> {
    const response = await fetch(`${API_BASE_URL}/queue/affinity-stats`, {
        credentials: 'include',
    });
    return handleResponse<AffinityStatEntry[]>(response);
}
