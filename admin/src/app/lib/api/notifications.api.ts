import { API_BASE_URL, handleResponse } from './_http';

export interface AdminNotification {
    id: string;
    type: 'message' | 'queue' | 'alert' | 'info';
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
}

export function getNotificationStreamUrl(): string {
    return `${API_BASE_URL}/api/notifications/stream`;
}

export async function getNotifications(limit = 50, offset = 0): Promise<{ data: AdminNotification[]; total: number }> {
    const response = await fetch(`${API_BASE_URL}/api/notifications?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<{ data: AdminNotification[]; total: number }>(response);
}

export async function getUnreadCount(): Promise<number> {
    const response = await fetch(`${API_BASE_URL}/api/notifications/unread-count`, {
        method: 'GET',
        credentials: 'include',
    });
    const result = await handleResponse<{ count: number }>(response);
    return result.count;
}

export async function markNotificationRead(id: string): Promise<void> {
    await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
        method: 'PATCH',
        credentials: 'include',
    });
}

export async function markAllNotificationsRead(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
        method: 'PATCH',
        credentials: 'include',
    });
}

export async function clearAllNotifications(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'DELETE',
        credentials: 'include',
    });
}
