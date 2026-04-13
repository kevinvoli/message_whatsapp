import { SystemConfigEntry, SystemConfigCatalogueEntry, WebhookEntry } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getSystemConfigs(): Promise<SystemConfigEntry[]> {
    const response = await fetch(`${API_BASE_URL}/system-config`, {
        credentials: 'include',
    });
    return handleResponse<SystemConfigEntry[]>(response);
}

export async function getSystemConfigCatalogue(): Promise<SystemConfigCatalogueEntry[]> {
    const response = await fetch(`${API_BASE_URL}/system-config/catalogue`, {
        credentials: 'include',
    });
    return handleResponse<SystemConfigCatalogueEntry[]>(response);
}

export async function updateSystemConfig(key: string, value: string): Promise<SystemConfigEntry> {
    const response = await fetch(`${API_BASE_URL}/system-config/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, value }),
    });
    return handleResponse<SystemConfigEntry>(response);
}

export async function getWebhookUrls(): Promise<WebhookEntry[]> {
    const response = await fetch(`${API_BASE_URL}/system-config/webhooks`, {
        credentials: 'include',
    });
    return handleResponse<WebhookEntry[]>(response);
}

export async function bulkUpdateSystemConfig(entries: { key: string; value: string }[]): Promise<{ updated: number }> {
    const response = await fetch(`${API_BASE_URL}/system-config/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entries }),
    });
    return handleResponse<{ updated: number }>(response);
}

// ─── System Health Alert ──────────────────────────────────────────────────────

export interface SystemHealthStatus {
    alerting: boolean;
    silenceMinutes: number;
    lastInboundAt: string;
}

export interface AlertRecipient {
    phone: string;
    name: string;
}

export interface AlertConfig {
    enabled: boolean;
    silenceThresholdMinutes: number;
    retryAfterMinutes: number;
    recipients: AlertRecipient[];
    messageTemplate: string | null;
    defaultChannelId: string | null;
}

export interface AlertSendResult {
    recipientName: string;
    recipientPhone: string;
    success: boolean;
    channelId: string | null;
    channelName: string | null;
    error: string | null;
    providerMessageId: string | null;
    messageStatus: 'pending' | 'sent' | 'delivered' | 'read' | null;
    whapiFlagged: boolean;
}

export interface LastAlertAttempt {
    triggeredAt: string;
    silenceMinutes: number;
    results: AlertSendResult[];
    overallSuccess: boolean;
}

export interface AlertStatus extends SystemHealthStatus {
    lastAlertAttempt: LastAlertAttempt | null;
    timerActive: boolean;
    enabled: boolean;
}

export async function getSystemHealthStatus(): Promise<AlertStatus> {
    const response = await fetch(`${API_BASE_URL}/admin/alert-config/status`, {
        credentials: 'include',
    });
    return handleResponse<AlertStatus>(response);
}

export async function getAlertConfig(): Promise<AlertConfig> {
    const response = await fetch(`${API_BASE_URL}/admin/alert-config`, {
        credentials: 'include',
    });
    return handleResponse<AlertConfig>(response);
}

export async function updateAlertConfig(patch: Partial<AlertConfig>): Promise<AlertConfig> {
    const response = await fetch(`${API_BASE_URL}/admin/alert-config`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    });
    return handleResponse<AlertConfig>(response);
}

export async function getAlertDefaultTemplate(): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/admin/alert-config/default-template`, {
        credentials: 'include',
    });
    const data = await handleResponse<{ template: string }>(response);
    return data.template;
}

export async function sendTestAlert(): Promise<{ results: AlertSendResult[]; message: string }> {
    const response = await fetch(`${API_BASE_URL}/admin/alert-config/test`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ results: AlertSendResult[]; message: string }>(response);
}
