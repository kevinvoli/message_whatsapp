import { StoredMediaResponse, GalerieFilterOptions } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getStoredMedias(params?: {
    channelId?: string;
    posteId?: string;
    direction?: 'IN' | 'OUT';
    mediaType?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: string;
}): Promise<StoredMediaResponse> {
    const qs = new URLSearchParams();
    if (params?.channelId) qs.set('channelId', params.channelId);
    if (params?.posteId)   qs.set('posteId',   params.posteId);
    if (params?.direction) qs.set('direction', params.direction);
    if (params?.mediaType) qs.set('mediaType', params.mediaType);
    if (params?.page)      qs.set('page',      String(params.page));
    if (params?.limit)     qs.set('limit',     String(params.limit));
    if (params?.sort)      qs.set('sort',      params.sort);
    if (params?.order)     qs.set('order',     params.order);
    const res = await fetch(`${API_BASE_URL}/media-storage/gallery?${qs}`, { credentials: 'include' });
    return handleResponse<StoredMediaResponse>(res);
}

export async function getGalerieFilterOptions(): Promise<GalerieFilterOptions> {
    const res = await fetch(`${API_BASE_URL}/media-storage/gallery/filters`, { credentials: 'include' });
    return handleResponse<GalerieFilterOptions>(res);
}
