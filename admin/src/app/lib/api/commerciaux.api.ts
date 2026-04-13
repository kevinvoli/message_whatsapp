import { Commercial } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getCommerciaux(): Promise<Commercial[]> {
    const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<Commercial[]>(response);
}

export async function createCommercial(
    payload: { name: string; email: string; password: string; poste_id?: string | null },
): Promise<Commercial> {
    const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    return handleResponse<Commercial>(response);
}

export async function updateCommercial(
    id: string,
    payload: { name?: string; email?: string; password?: string; poste_id?: string | null; is_active?: boolean },
): Promise<Commercial> {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    return handleResponse<Commercial>(response);
}

export async function deleteCommercial(id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return handleResponse<{ message: string }>(response);
}
