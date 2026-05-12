import { API_BASE_URL, handleResponse } from './_http';

export type MissedCallStatus = 'pending' | 'assigned' | 'called_back' | 'escalated' | 'closed';

export interface MissedCallMetrics {
    totalToday: number;
    totalPending: number;
    totalAssigned: number;
    totalEscalated: number;
    totalCalledBack: number;
    totalClosed: number;
    slaComplianceRate: number;
    avgHandlingDelaySeconds: number | null;
    topPostesOverdue: Array<{ posteId: string; count: number }>;
}

export interface MissedCallRow {
    id: string;
    source: string;
    clientPhone: string;
    clientName: string | null;
    posteId: string | null;
    commercialId: string | null;
    status: MissedCallStatus;
    occurredAt: string;
    slaBreachedAt: string | null;
    callbackDoneAt: string | null;
    handlingDelaySeconds: number | null;
    callbackTaskId: string | null;
}

export interface MissedCallListResult {
    items: MissedCallRow[];
    total: number;
}

export async function getMissedCallMetrics(): Promise<MissedCallMetrics> {
    const response = await fetch(`${API_BASE_URL}/admin/missed-calls/metrics`, {
        credentials: 'include',
    });
    return handleResponse<MissedCallMetrics>(response);
}

export async function listMissedCalls(params?: {
    status?: MissedCallStatus;
    posteId?: string;
    commercialId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
}): Promise<MissedCallListResult> {
    const qs = new URLSearchParams();
    if (params?.status)       qs.set('status', params.status);
    if (params?.posteId)      qs.set('posteId', params.posteId);
    if (params?.commercialId) qs.set('commercialId', params.commercialId);
    if (params?.dateFrom)     qs.set('dateFrom', params.dateFrom);
    if (params?.dateTo)       qs.set('dateTo', params.dateTo);
    if (params?.page)         qs.set('page', String(params.page));
    if (params?.limit)        qs.set('limit', String(params.limit));

    const response = await fetch(`${API_BASE_URL}/admin/missed-calls?${qs.toString()}`, {
        credentials: 'include',
    });
    return handleResponse<MissedCallListResult>(response);
}

export async function closeMissedCall(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/admin/missed-calls/${id}/close`, {
        method: 'PATCH',
        credentials: 'include',
    });
    await handleResponse<{ ok: boolean }>(response);
}
