import { StatsGlobales, MetriquesGlobales, PerformanceCommercial, StatutChannel, PerformanceTemporelle, WebhookMetricsSnapshot } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getStatsGlobales(): Promise<StatsGlobales> {
    const response = await fetch(`${API_BASE_URL}/stats`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<StatsGlobales>(response);
}

export async function getMetriquesGlobales(): Promise<MetriquesGlobales> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/globales`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<MetriquesGlobales>(response);
}

export async function getPerformanceCommerciaux(periode = 'today'): Promise<PerformanceCommercial[]> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/commerciaux?periode=${periode}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<PerformanceCommercial[]>(response);
}

export async function getStatutChannels(): Promise<StatutChannel[]> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/channels`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<StatutChannel[]>(response);
}

export async function getPerformanceTemporelle(jours = 7): Promise<PerformanceTemporelle[]> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/performance-temporelle?jours=${jours}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<PerformanceTemporelle[]>(response);
}

export async function getOverviewMetriques(periode = 'today', dateFrom?: string, dateTo?: string) {
    const params = new URLSearchParams({ periode });
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const response = await fetch(`${API_BASE_URL}/api/metriques/overview?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
    });
    const result = await handleResponse<{
        success: boolean;
        timestamp: string;
        computed_at?: string;
        from_snapshot?: boolean;
        data: {
            metriques: MetriquesGlobales;
            performanceCommercial: PerformanceCommercial[];
            statutChannels: StatutChannel[];
            performanceTemporelle: PerformanceTemporelle[];
        };
    }>(response);
    return { ...result.data, computed_at: result.computed_at, from_snapshot: result.from_snapshot };
}

export async function getOverviewSection<T>(
    section: 'globales' | 'commerciaux' | 'channels' | 'temporelle',
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
): Promise<T> {
    const params = new URLSearchParams({ periode, section });
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const response = await fetch(`${API_BASE_URL}/api/metriques/overview?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
    });
    const result = await handleResponse<{
        success: boolean;
        data: T;
        computed_at?: string;
        from_snapshot?: boolean;
        section: string;
    }>(response);
    return result.data;
}

export async function refreshSnapshots(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/refresh-snapshots`, {
        method: 'POST',
        credentials: 'include',
    });
    await handleResponse<{ success: boolean }>(response);
}

export async function getWebhookMetrics(): Promise<WebhookMetricsSnapshot> {
    const response = await fetch(`${API_BASE_URL}/metrics/webhook`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<WebhookMetricsSnapshot>(response);
}
