import { PanelMediaResponse } from '@/types/media-panel';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export async function getPanelMedia(page = 1, limit = 30): Promise<PanelMediaResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const response = await fetch(`${API_BASE_URL}/poste/poste-panel/media?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`getPanelMedia: ${response.status}`);
  }
  return response.json() as Promise<PanelMediaResponse>;
}
