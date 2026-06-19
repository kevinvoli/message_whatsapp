import { Poste, PostePanelConfig } from '../definitions';
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

export async function getPostePanelConfig(posteId: string): Promise<PostePanelConfig> {
    const response = await fetch(`${API_BASE_URL}/poste/${posteId}/panel`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<PostePanelConfig>(response);
}

export async function updatePostePanelConfig(
    posteId: string,
    payload: { enabled: boolean; types: string[] },
): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/poste/${posteId}/panel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    if (!response.ok) {
        await handleResponse<void>(response);
    }
}
