import { MediaAsset } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getMediaAssets(params?: {
    type?: string;
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: string;
}): Promise<{ items: MediaAsset[]; total: number; pages: number }> {
    const query = new URLSearchParams();
    if (params?.type && params.type !== 'all') query.set('type', params.type);
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.sort) query.set('sort', params.sort);
    if (params?.order) query.set('order', params.order);
    const qs = query.toString();
    const url = qs ? `${API_BASE_URL}/media-assets?${qs}` : `${API_BASE_URL}/media-assets`;
    const response = await fetch(url, { method: 'GET', credentials: 'include' });
    return handleResponse<{ items: MediaAsset[]; total: number; pages: number }>(response);
}

export async function uploadMediaAsset(payload: {
    file: File;
    name: string;
    category?: string;
    tags?: string[];
    colorLabel?: string;
}): Promise<MediaAsset> {
    const formData = new FormData();
    formData.append('file', payload.file);
    formData.append('name', payload.name);
    if (payload.category) formData.append('category', payload.category);
    if (payload.tags) formData.append('tags', JSON.stringify(payload.tags));
    if (payload.colorLabel) formData.append('colorLabel', payload.colorLabel);
    const response = await fetch(`${API_BASE_URL}/media-assets/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
    });
    return handleResponse<MediaAsset>(response);
}

export async function updateMediaAsset(id: string, payload: {
    name?: string;
    category?: string;
    tags?: string[];
    colorLabel?: string;
}): Promise<MediaAsset> {
    const response = await fetch(`${API_BASE_URL}/media-assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    return handleResponse<MediaAsset>(response);
}

export async function deleteMediaAsset(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/media-assets/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok && response.status !== 204) {
        await handleResponse<void>(response);
    }
}

export async function getMediaCategories(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/media-assets/categories`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<string[]>(response);
}
