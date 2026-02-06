// admin/src/app/lib/api.ts

import { Commercial, StatsGlobales, Poste, Channel, MessageAuto, Client } from './definitions';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

// Fonction pour gérer les erreurs de fetch
async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || 'An unknown error occurred');
    }
    return response.json() as Promise<T>;
}

export async function getStatsGlobales(token: string): Promise<StatsGlobales> {
    const response = await fetch(`${API_BASE_URL}/stats`, {
        method: 'GET', // Explicitly specify method
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse<StatsGlobales>(response);
}

export async function getCommerciaux(token: string): Promise<Commercial[]> {
    const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'GET', // Explicitly specify method
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse<Commercial[]>(response);
}

export async function login(email: string, password: string): Promise<{ access_token: string, user: any }> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
    });
    return handleResponse<{ access_token: string, user: any }>(response);
}

export async function loginAdmin(email: string, password: string): Promise<{ access_token: string, admin: any }> {
    const response = await fetch(`${API_BASE_URL}/auth/admin/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
    });
    return handleResponse<{ access_token: string, admin: any }>(response);
}

export async function getPostes(token: string): Promise<Poste[]> {
    const response = await fetch(`${API_BASE_URL}/poste`, {
        method: 'GET', // Explicitly specify method
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse<Poste[]>(response);
}

export async function createPoste(token: string, poste: Omit<Poste, 'id' | 'created_at' | 'updated_at'>): Promise<Poste> {
    const response = await fetch(`${API_BASE_URL}/poste`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(poste),
    });
    return handleResponse<Poste>(response);
}

export async function updatePoste(token: string, id: string, poste: Partial<Poste>): Promise<Poste> {
    const response = await fetch(`${API_BASE_URL}/poste/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(poste),
    });
    return handleResponse<Poste>(response);
}

export async function deletePoste(token: string, id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/poste/${id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        },
    });
    return handleResponse<{ message: string }>(response);
}

export async function getChannels(token: string): Promise<Channel[]> {
    const response = await fetch(`${API_BASE_URL}/channel`, {
        method: 'GET', // Explicitly specify method
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse<Channel[]>(response);
}

export async function getMessageAuto(token: string): Promise<MessageAuto[]> {
    const response = await fetch(`${API_BASE_URL}/message-auto`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse<MessageAuto[]>(response);
}

export async function getClients(token: string): Promise<Client[]> {
    const response = await fetch(`${API_BASE_URL}/contact`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse<Client[]>(response);
}