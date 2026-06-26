import { Poste } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getPostes(): Promise<Poste[]> {
  return handleResponse<Poste[]>(
    await fetch(`${API_BASE_URL}/poste`, { credentials: 'include' }),
  );
}
