// admin/src/app/lib/api.ts

import { Commercial, StatsGlobales, Poste, Channel, MessageAuto, Client, WhatsappChat, WhatsappMessage } from './definitions'; // Added WhatsappChat, WhatsappMessage

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

// Fonction pour gérer les erreurs de fetch
async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        let errorMessage: string;
        try {
            // Attempt to parse JSON only if the response has content-type: application/json
            // and the status is not 204 No Content
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json") && response.status !== 204) {
                const errorData = await response.json();
                errorMessage = errorData.message || JSON.stringify(errorData);
            } else {
                errorMessage = response.statusText || `An unknown error occurred (Status: ${response.status})`;
            }
        } catch (e) {
            // Fallback for when response.json() fails or body is unreadable (e.g., XrayWrapper issues)
            errorMessage = response.statusText || `An unknown error occurred (Status: ${response.status})`;
        }
        throw new Error(errorMessage);
    }
    return response.json() as Promise<T>;
}

// Functions that send Authorization header automatically via HTTP-only cookies
export async function getStatsGlobales(): Promise<StatsGlobales> {
    const response = await fetch(`${API_BASE_URL}/stats`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<StatsGlobales>(response);
}

export async function getCommerciaux(): Promise<Commercial[]> {
    const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<Commercial[]>(response);
}

export async function getMessages(): Promise<WhatsappMessage[]> {
    const response = await fetch(`${API_BASE_URL}/messages`, {
        method: 'GET',
        credentials: 'include',
    });
    console.log("retous des message =================",response);
    
    return handleResponse<WhatsappMessage[]>(response);
}

export async function getPostes(): Promise<Poste[]> {
    const response = await fetch(`${API_BASE_URL}/poste`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<Poste[]>(response);
}

export async function createPoste(poste: Omit<Poste, 'id' | 'created_at' | 'updated_at'>): Promise<Poste> {
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

export async function getChannels(): Promise<Channel[]> {
    const response = await fetch(`${API_BASE_URL}/channel`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<Channel[]>(response);
}

export async function createChannel(channel: Omit<Channel, 'id' | 'start_at' | 'uptime' | 'version' | 'device_id' | 'ip' | 'is_business' | 'api_version' | 'core_version' | 'createdAt' | 'updatedAt'>): Promise<Channel> {
    const response = await fetch(`${API_BASE_URL}/channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel),
        credentials: 'include',
    });
    return handleResponse<Channel>(response);
}

export async function updateChannel(id: string, channel: Partial<Channel>): Promise<Channel> {
    const response = await fetch(`${API_BASE_URL}/channel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel),
        credentials: 'include',
    });
    return handleResponse<Channel>(response);
}

export async function deleteChannel(id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/channel/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return handleResponse<{ message: string }>(response);
}

export async function getMessageAuto(): Promise<MessageAuto[]> {
    const response = await fetch(`${API_BASE_URL}/message-auto`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<MessageAuto[]>(response);
}

export async function createMessageAuto(messageAuto: Omit<MessageAuto, 'id' | 'created_at' | 'updated_at' | 'conditions' >): Promise<MessageAuto> {
    const response = await fetch(`${API_BASE_URL}/message-auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageAuto),
        credentials: 'include',
    });
    return handleResponse<MessageAuto>(response);
}

export async function updateMessageAuto(id: string, messageAuto: Partial<MessageAuto>): Promise<MessageAuto> {
    const response = await fetch(`${API_BASE_URL}/message-auto/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageAuto),
        credentials: 'include',
    });
    return handleResponse<MessageAuto>(response);
}

export async function deleteMessageAuto(id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/message-auto/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return handleResponse<{ message: string }>(response);
}

export async function getClients(): Promise<Client[]> {
    const response = await fetch(`${API_BASE_URL}/contact`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<Client[]>(response);
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

export async function getChats(): Promise<WhatsappChat[]> {
    const response = await fetch(`${API_BASE_URL}/chats`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<WhatsappChat[]>(response);
}

export async function getMessagesForChat(chat_id: string): Promise<WhatsappMessage[]> {
    const response = await fetch(`${API_BASE_URL}/messages/${chat_id}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<WhatsappMessage[]>(response);
}

export async function sendMessage(chat_id: string, text: string, poste_id: string, channel_id: string): Promise<WhatsappMessage> {
    const response = await fetch(`${API_BASE_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text, poste_id, channel_id }),
        credentials: 'include',
    });
    return handleResponse<WhatsappMessage>(response);
}

// Auth-related functions that do not send Authorization header automatically (login/logout explicit)
export async function checkAdminAuth(): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/admin/profile`, {
            method: 'GET',
            credentials: 'include',
        });
        return response.ok;
    } catch (error) {
        console.error("Error checking admin auth status:", error);
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
    console.log("reponse user connection",response);
    
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