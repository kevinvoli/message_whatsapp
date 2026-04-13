import { logger } from '../logger';
import { API_BASE_URL, handleResponse } from './_http';

export async function checkAdminAuth(): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/admin/profile`, {
            method: 'GET',
            credentials: 'include',
        });
        return response.ok;
    } catch (error) {
        logger.error('Error checking admin auth status', {
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

export async function login(email: string, password: string): Promise<{ user: any }> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
    });
    return handleResponse<{ user: any }>(response);
}

export async function loginAdmin(email: string, password: string): Promise<{ admin: any }> {
    const response = await fetch(`${API_BASE_URL}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
    });
    return handleResponse<{ admin: any }>(response);
}

export async function logout(): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ message: string }>(response);
}

export async function logoutAdmin(): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/admin/logout`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ message: string }>(response);
}

export async function getAdminProfile(): Promise<{ id: string; name: string; email: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/admin/profile`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<{ id: string; name: string; email: string }>(response);
}
