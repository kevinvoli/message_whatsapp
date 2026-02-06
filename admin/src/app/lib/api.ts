// admin/src/app/lib/api.ts

import { Commercial, StatsGlobales, Poste, Channel } from './definitions';

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

export async function getPostes(token: string): Promise<Poste[]> {
    const response = await fetch(`${API_BASE_URL}/poste`, {
        method: 'GET', // Explicitly specify method
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse<Poste[]>(response);
}

export async function getChannels(token: string): Promise<Channel[]> {
    const response = await fetch(`${API_BASE_URL}/channel`, {
        method: 'GET', // Explicitly specify method
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse<Channel[]>(response);
}