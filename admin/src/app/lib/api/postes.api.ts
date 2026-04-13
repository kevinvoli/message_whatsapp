import { Poste } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getPostes(): Promise<Poste[]> {
    const response = await fetch(`${API_BASE_URL}/poste`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<Poste[]>(response);
}

export async function createPoste(poste: Omit<Poste, 'id' | 'createdAt' | 'updatedAt' | 'messages' | 'commercial' | 'chats'>): Promise<Poste> {
    const response = await fetch(`${API_BASE_URL}/poste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(poste),
        credentials: 'include',
    });
    return handleResponse<Poste>(response);
}

export async function updatePoste(id: string, poste: Partial<Poste>): Promise<Poste> {
    const response = await fetch(`${API_BASE_URL}/poste/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(poste),
        credentials: 'include',
    });
    return handleResponse<Poste>(response);
}

export async function deletePoste(id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/poste/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return handleResponse<{ message: string }>(response);
}
