import { Client } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getClients(limit = 50, offset = 0): Promise<{ data: Client[]; total: number }> {
    const response = await fetch(`${API_BASE_URL}/contact?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<{ data: Client[]; total: number }>(response);
}

export async function createClient(client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client> {
    const response = await fetch(`${API_BASE_URL}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(client),
        credentials: 'include',
    });
    return handleResponse<Client>(response);
}

export async function updateClient(id: string, client: Partial<Client>): Promise<Client> {
    const response = await fetch(`${API_BASE_URL}/contact/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(client),
        credentials: 'include',
    });
    return handleResponse<Client>(response);
}

export async function deleteClient(id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/contact/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return handleResponse<{ message: string }>(response);
}
