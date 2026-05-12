import { API_BASE_URL, handleResponse } from './_http';

export type CallTaskCategory = 'commande_annulee' | 'commande_avec_livraison' | 'jamais_commande';
export type CallTaskStatus   = 'pending' | 'done';

export interface CallTaskMetrics {
    totalToday: number;
    totalPending: number;
    totalDone: number;
    avgDurationSeconds: number | null;
    topPostesOverdue: Array<{ posteId: string; posteName: string | null; count: number }>;
}

export interface CallTaskRow {
    id: string;
    category: CallTaskCategory;
    status: CallTaskStatus;
    clientPhone: string | null;
    callEventId: string | null;
    durationSeconds: number | null;
    completedAt: string | null;
    createdAt: string;
    posteId: string;
    posteName: string | null;
    commercialName: string | null;
    batchNumber: number;
}

export interface CallTaskListResult {
    items: CallTaskRow[];
    total: number;
}

export async function getCallTaskMetrics(category: CallTaskCategory): Promise<CallTaskMetrics> {
    const response = await fetch(
        `${API_BASE_URL}/admin/call-tasks/metrics?category=${encodeURIComponent(category)}`,
        { credentials: 'include' },
    );
    return handleResponse<CallTaskMetrics>(response);
}

export async function listCallTasks(params: {
    category: CallTaskCategory;
    status?: CallTaskStatus;
    posteId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
}): Promise<CallTaskListResult> {
    const qs = new URLSearchParams();
    qs.set('category', params.category);
    if (params.status)   qs.set('status',   params.status);
    if (params.posteId)  qs.set('posteId',  params.posteId);
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo)   qs.set('dateTo',   params.dateTo);
    if (params.page)     qs.set('page',     String(params.page));
    if (params.limit)    qs.set('limit',    String(params.limit));

    const response = await fetch(`${API_BASE_URL}/admin/call-tasks?${qs.toString()}`, {
        credentials: 'include',
    });
    return handleResponse<CallTaskListResult>(response);
}
