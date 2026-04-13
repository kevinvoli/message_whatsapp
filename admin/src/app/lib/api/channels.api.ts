import { Channel } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getChannels(): Promise<Channel[]> {
    const response = await fetch(`${API_BASE_URL}/channel`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<Channel[]>(response);
}

export async function createChannel(channel: {
    token: string;
    label?: string;
    provider?: import('../definitions').ProviderType;
    channel_id?: string;
    external_id?: string;
    is_business?: boolean;
}): Promise<Channel> {
    const response = await fetch(`${API_BASE_URL}/channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel),
        credentials: 'include',
    });
    return handleResponse<Channel>(response);
}

export async function updateChannel(id: string, channel: Partial<Channel>): Promise<Channel> {
    const response = await fetch(`${API_BASE_URL}/channel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel),
        credentials: 'include',
    });
    return handleResponse<Channel>(response);
}

export async function refreshChannelToken(id: string): Promise<Channel> {
    const response = await fetch(`${API_BASE_URL}/channel/${id}/refresh-token`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<Channel>(response);
}

export async function deleteChannel(id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/channel/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return handleResponse<{ message: string }>(response);
}

/**
 * Assigne ou désassigne un poste dédié à un channel.
 * @param channelId - channel_id du canal (ex: phone_number_id Meta)
 * @param posteId   - UUID du poste, ou null pour retour en pool global
 */
export async function assignChannelToPoste(channelId: string, posteId: string | null): Promise<Channel> {
    const response = await fetch(`${API_BASE_URL}/channel/${encodeURIComponent(channelId)}/assign-poste`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poste_id: posteId }),
        credentials: 'include',
    });
    return handleResponse<Channel>(response);
}
