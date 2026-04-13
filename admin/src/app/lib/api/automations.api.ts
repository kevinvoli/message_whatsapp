import { MessageAuto, AutoMessageScopeConfig, AutoMessageScopeType, AutoMessageTriggerType, AutoMessageKeyword, BusinessHoursConfig, KeywordMatchType } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getMessageAuto(): Promise<MessageAuto[]> {
    const response = await fetch(`${API_BASE_URL}/message-auto`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<MessageAuto[]>(response);
}

export async function createMessageAuto(messageAuto: Omit<MessageAuto, 'id' | 'createdAt' | 'updatedAt' | 'keywords'>): Promise<MessageAuto> {
    const response = await fetch(`${API_BASE_URL}/message-auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageAuto),
        credentials: 'include',
    });
    return handleResponse<MessageAuto>(response);
}

export async function updateMessageAuto(id: string, messageAuto: Partial<MessageAuto>): Promise<MessageAuto> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt, updatedAt, ...cleanPayload } = messageAuto as MessageAuto;
    const response = await fetch(`${API_BASE_URL}/message-auto/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanPayload),
        credentials: 'include',
    });
    return handleResponse<MessageAuto>(response);
}

export async function deleteMessageAuto(id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/message-auto/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return handleResponse<{ message: string }>(response);
}

export async function getScopeConfigs(): Promise<AutoMessageScopeConfig[]> {
    const response = await fetch(`${API_BASE_URL}/message-auto/scope-config`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<AutoMessageScopeConfig[]>(response);
}

export async function getScopeConfigsByType(type: AutoMessageScopeType): Promise<AutoMessageScopeConfig[]> {
    const response = await fetch(`${API_BASE_URL}/message-auto/scope-config/type/${type}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<AutoMessageScopeConfig[]>(response);
}

export async function upsertScopeConfig(payload: {
    scope_type: AutoMessageScopeType;
    scope_id: string;
    label?: string;
    enabled: boolean;
}): Promise<AutoMessageScopeConfig> {
    const response = await fetch(`${API_BASE_URL}/message-auto/scope-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    return handleResponse<AutoMessageScopeConfig>(response);
}

export async function deleteScopeConfig(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/message-auto/scope-config/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return handleResponse<void>(response);
}

export async function getMessageAutoByTrigger(trigger: AutoMessageTriggerType): Promise<MessageAuto[]> {
    const response = await fetch(`${API_BASE_URL}/message-auto/by-trigger/${trigger}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<MessageAuto[]>(response);
}

export async function addKeyword(
    messageAutoId: string,
    payload: { keyword: string; matchType: KeywordMatchType; caseSensitive?: boolean; actif?: boolean },
): Promise<AutoMessageKeyword> {
    const response = await fetch(`${API_BASE_URL}/message-auto/${messageAutoId}/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    return handleResponse<AutoMessageKeyword>(response);
}

export async function removeKeyword(messageAutoId: string, keywordId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/message-auto/${messageAutoId}/keywords/${keywordId}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return handleResponse<void>(response);
}

export async function getBusinessHours(): Promise<BusinessHoursConfig[]> {
    const response = await fetch(`${API_BASE_URL}/message-auto/business-hours`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<BusinessHoursConfig[]>(response);
}

export async function updateBusinessHoursDay(
    dayOfWeek: number,
    payload: { openHour?: number; openMinute?: number; closeHour?: number; closeMinute?: number; isOpen?: boolean },
): Promise<BusinessHoursConfig> {
    const response = await fetch(`${API_BASE_URL}/message-auto/business-hours/${dayOfWeek}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    return handleResponse<BusinessHoursConfig>(response);
}
