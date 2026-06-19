import { CampaignLink, CampaignLinkClick, CampaignLinkStats } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getCampaignLinks(): Promise<CampaignLink[]> {
    const response = await fetch(`${API_BASE_URL}/campaign-links`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<CampaignLink[]>(response);
}

export async function getCampaignLink(id: string): Promise<CampaignLink> {
    const response = await fetch(`${API_BASE_URL}/campaign-links/${id}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<CampaignLink>(response);
}

export async function createCampaignLink(data: {
    name: string;
    channel_id: string;
    predefined_message: string;
    is_active?: boolean;
}): Promise<CampaignLink> {
    const response = await fetch(`${API_BASE_URL}/campaign-links`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse<CampaignLink>(response);
}

export async function updateCampaignLink(id: string, data: {
    name?: string;
    channel_id?: string;
    predefined_message?: string;
    is_active?: boolean;
}): Promise<CampaignLink> {
    const response = await fetch(`${API_BASE_URL}/campaign-links/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse<CampaignLink>(response);
}

export async function deleteCampaignLink(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/campaign-links/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok && response.status !== 204) {
        return handleResponse<void>(response);
    }
}

export async function getCampaignLinkStats(
    id: string,
    from?: string,
    to?: string,
): Promise<CampaignLinkStats> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const response = await fetch(`${API_BASE_URL}/campaign-links/${id}/analytics?${params}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<CampaignLinkStats>(response);
}

export async function getCampaignLinkClicks(
    id: string,
    page = 1,
): Promise<CampaignLinkClick[]> {
    const response = await fetch(`${API_BASE_URL}/campaign-links/${id}/clicks?page=${page}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<CampaignLinkClick[]>(response);
}

export async function attachMediaAssetToLink(linkId: string, assetId: string): Promise<CampaignLink> {
    const response = await fetch(`${API_BASE_URL}/campaign-links/${linkId}/media-asset/${assetId}`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<CampaignLink>(response);
}

export async function detachMediaAssetFromLink(linkId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/campaign-links/${linkId}/media-asset`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok && response.status !== 204) {
        await handleResponse<void>(response);
    }
}

export async function uploadMediaDirectToLink(linkId: string, file: File): Promise<CampaignLink> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE_URL}/campaign-links/${linkId}/media-upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
    });
    return handleResponse<CampaignLink>(response);
}
