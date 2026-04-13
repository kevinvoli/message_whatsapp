import { WhatsappChat, WhatsappMessage, PosteStats, CommercialStats } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';
import { normalizeWhatsappChat } from '../mappers/chat.mapper';

export async function getChats(
    limit = 50,
    offset = 0,
    periode = 'today',
    posteId?: string,
    commercialId?: string,
): Promise<{ data: WhatsappChat[]; total: number; totalAll: number; totalActifs: number; totalEnAttente: number; totalUnread: number; totalFermes: number }> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset), periode });
    if (posteId) params.set('poste_id', posteId);
    if (commercialId) params.set('commercial_id', commercialId);
    const response = await fetch(`${API_BASE_URL}/chats?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
    });
    const result = await handleResponse<{
        data: Array<Partial<WhatsappChat> & {
            unreadCount?: number;
            unread_count?: number;
            channel_id?: string;
            last_msg_client_channel_id?: string;
            client_phone?: string;
            contact_client?: string;
            status?: string;
        }>;
        total: number;
        totalAll?: number;
        totalActifs?: number;
        totalEnAttente?: number;
        totalUnread?: number;
        totalFermes?: number;
    }>(response);
    return {
        data: result.data.map(normalizeWhatsappChat),
        total: result.total,
        totalAll: result.totalAll ?? result.total,
        totalActifs: result.totalActifs ?? 0,
        totalEnAttente: result.totalEnAttente ?? 0,
        totalUnread: result.totalUnread ?? 0,
        totalFermes: result.totalFermes ?? 0,
    };
}

export async function getChatStatsByPoste(): Promise<PosteStats[]> {
    const response = await fetch(`${API_BASE_URL}/chats/stats/by-poste`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<PosteStats[]>(response);
}

export async function getChatStatsByCommercial(): Promise<CommercialStats[]> {
    const response = await fetch(`${API_BASE_URL}/chats/stats/by-commercial`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<CommercialStats[]>(response);
}

export async function getMessages(limit = 50, offset = 0, periode = 'today'): Promise<{ data: WhatsappMessage[]; total: number }> {
    const response = await fetch(`${API_BASE_URL}/messages?limit=${limit}&offset=${offset}&periode=${periode}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<{ data: WhatsappMessage[]; total: number }>(response);
}

export async function getMessagesForChat(chat_id: string): Promise<WhatsappMessage[]> {
    const response = await fetch(`${API_BASE_URL}/messages/${chat_id}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<WhatsappMessage[]>(response);
}

export async function getMessageCount(chat_id: string): Promise<number> {
    const response = await fetch(`${API_BASE_URL}/messages/${chat_id}/count`, {
        method: 'GET',
        credentials: 'include',
    });
    const result = await handleResponse<{ count: number }>(response);
    return result.count;
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

export async function patchChat(chatId: string, data: Partial<{ read_only: boolean; is_archived: boolean }>): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/chats/${encodeURIComponent(chatId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Erreur mise à jour conversation');
}
