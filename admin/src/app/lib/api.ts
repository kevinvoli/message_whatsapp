// admin/src/app/lib/api.ts

import { Commercial, StatsGlobales, Poste, Channel, MessageAuto, Client, WhatsappChat, WhatsappMessage, MetriquesGlobales, PerformanceCommercial, StatutChannel, PerformanceTemporelle, QueuePosition, DispatchSnapshot, DispatchSettings, DispatchSettingsAudit, WebhookMetricsSnapshot } from './definitions'; // Added WhatsappChat, WhatsappMessage
import { logger } from './logger';
import data from '@emoji-mart/data';

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
    return handleResponse<WhatsappMessage[]>(response);
}

export async function getPostes(): Promise<Poste[]> {
    const response = await fetch(`${API_BASE_URL}/poste`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<Poste[]>(response);
}

export async function createPoste(poste: Omit<Poste, 'id' | 'created_at' | 'updated_at' | 'messages' | 'commercial' | 'chats'>): Promise<Poste> {
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

export async function updateCommercial(
  id: string,
  payload: { name?: string; is_active?: boolean; poste_id?: string | null },
): Promise<Commercial> {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    return handleResponse<Commercial>(response);
}

export async function getChannels(): Promise<Channel[]> {
    const response = await fetch(`${API_BASE_URL}/channel`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<Channel[]>(response);
}

export async function createChannel(channel: {
    token: string;
    provider?: 'whapi' | 'meta';
    channel_id?: string;
    external_id?: string;
    is_business?: boolean;
}): Promise<Channel> {
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
    const chats = await handleResponse<Array<Partial<WhatsappChat> & {
      unreadCount?: number;
      unread_count?: number;
      channel_id?: string;
      last_msg_client_channel_id?: string;
      client_phone?: string;
      contact_client?: string;
      status?: string;
    }>>(response);
    return chats.map(normalizeWhatsappChat);
}

export async function getQueue(): Promise<QueuePosition[]> {
    const response = await fetch(`${API_BASE_URL}/queue`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<QueuePosition[]>(response);
}

export async function getDispatchSnapshot(): Promise<DispatchSnapshot> {
    const response = await fetch(`${API_BASE_URL}/queue/dispatch`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<DispatchSnapshot>(response);
}

export async function getDispatchSettings(): Promise<DispatchSettings> {
    const response = await fetch(`${API_BASE_URL}/queue/dispatch/settings`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<DispatchSettings>(response);
}

export async function updateDispatchSettings(
  payload: Partial<DispatchSettings>,
): Promise<DispatchSettings> {
    const { id, created_at, updated_at, ...cleanPayload } = payload as DispatchSettings;
  
    const response = await fetch(`${API_BASE_URL}/queue/dispatch/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanPayload),
        credentials: 'include',
    });
    return handleResponse<DispatchSettings>(response);
}

export async function resetDispatchSettings(): Promise<DispatchSettings> {
    const response = await fetch(`${API_BASE_URL}/queue/dispatch/settings/reset`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<DispatchSettings>(response);
}

export async function getDispatchSettingsAudit(
  params: { limit?: number; offset?: number; resetOnly?: boolean; q?: string; from?: string; to?: string } = {},
): Promise<DispatchSettingsAudit[]> {
    const { limit = 50, offset = 0, resetOnly = false, q = '', from = '', to = '' } = params;
    const response = await fetch(
      `${API_BASE_URL}/queue/dispatch/settings/audit?limit=${limit}&offset=${offset}&reset_only=${resetOnly}&q=${encodeURIComponent(q)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        method: 'GET',
        credentials: 'include',
      },
    );
    return handleResponse<DispatchSettingsAudit[]>(response);
}

export async function getDispatchSettingsAuditPage(
  params: { page?: number; limit?: number; resetOnly?: boolean; q?: string; from?: string; to?: string } = {},
): Promise<{ data: DispatchSettingsAudit[]; total: number }> {
    const { page = 1, limit = 50, resetOnly = false, q = '', from = '', to = '' } = params;
    const response = await fetch(
      `${API_BASE_URL}/queue/dispatch/settings/audit/page?page=${page}&limit=${limit}&reset_only=${resetOnly}&q=${encodeURIComponent(q)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        method: 'GET',
        credentials: 'include',
      },
    );
    return handleResponse<{ data: DispatchSettingsAudit[]; total: number }>(response);
}

export async function resetQueue(): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/queue/reset`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function blockPosteFromQueue(posteId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/queue/block/${posteId}`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function unblockPosteFromQueue(posteId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/queue/unblock/${posteId}`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ success: boolean }>(response);
}

export async function getMessagesForChat(chat_id: string): Promise<WhatsappMessage[]> {
    const response = await fetch(`${API_BASE_URL}/messages/${chat_id}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<WhatsappMessage[]>(response);
}

function normalizeWhatsappChat(
  chat: Partial<WhatsappChat> & {
    unreadCount?: number;
    unread_count?: number;
    channel_id?: string;
    last_msg_client_channel_id?: string;
    client_phone?: string;
    contact_client?: string;
    status?: string;
  },
): WhatsappChat {
  const unread = chat.unread_count ?? chat.unreadCount ?? 0;
  const status =
    chat.status === 'en attente'
      ? 'attente'
      : (chat.status as WhatsappChat['status']) ?? 'attente';

  return {
    id: chat.id ?? '',
    chat_id: chat.chat_id ?? '',
    channel_id: chat.channel_id ?? chat.last_msg_client_channel_id,
    last_msg_client_channel_id: chat.last_msg_client_channel_id ?? chat.channel_id,
    poste_id: chat.poste_id ?? chat.poste?.id,
    name: chat.name ?? 'Client inconnu',
    type: chat.type ?? 'private',
    chat_pic: chat.chat_pic ?? '',
    chat_pic_full: chat.chat_pic_full ?? '',
    is_pinned: chat.is_pinned ?? false,
    is_muted: chat.is_muted ?? false,
    mute_until: chat.mute_until ?? null,
    is_archived: chat.is_archived ?? false,
    unread_count: unread,
    unreadCount: unread,
    status,
    unread_mention: chat.unread_mention ?? false,
    read_only: chat.read_only ?? false,
    not_spam: chat.not_spam ?? true,
    contact_client: chat.contact_client ?? chat.client_phone ?? '',
    client_phone: chat.client_phone ?? chat.contact_client,
    assigned_at: chat.assigned_at ?? null,
    assigned_mode: chat.assigned_mode ?? null,
    first_response_deadline_at: chat.first_response_deadline_at ?? null,
    last_client_message_at: chat.last_client_message_at ?? null,
    last_poste_message_at: chat.last_poste_message_at ?? null,
    auto_message_id: chat.auto_message_id ?? null,
    current_auto_message_id: chat.current_auto_message_id ?? null,
    auto_message_status: chat.auto_message_status ?? null,
    auto_message_step: chat.auto_message_step ?? 0,
    waiting_client_reply: chat.waiting_client_reply ?? false,
    last_auto_message_sent_at: chat.last_auto_message_sent_at ?? null,
    last_activity_at: chat.last_activity_at ?? '',
    createdAt: chat.createdAt ?? new Date(0).toISOString(),
    updatedAt: chat.updatedAt ?? new Date(0).toISOString(),
    poste: chat.poste as WhatsappChat['poste'],
    channel: chat.channel as WhatsappChat['channel'],
    contact: (chat as any).contact as WhatsappChat['contact'],
    messages: (chat.messages ?? []) as WhatsappChat['messages'],
    last_message: (chat as any).last_message ?? null,
  };
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
        logger.error("Error checking admin auth status", {
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



// admin/src/app/lib/api.ts - AJOUTER CES FONCTIONS



// ... (garder toutes tes fonctions existantes)

// ============================================
// NOUVELLES FONCTIONS POUR LES MÉTRIQUES
// ============================================

/**
 * Récupère toutes les métriques globales du dashboard
 */
export async function getMetriquesGlobales(): Promise<MetriquesGlobales> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/globales`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<MetriquesGlobales>(response);
}

/**
 * Récupère la performance détaillée de tous les commerciaux
 */
export async function getPerformanceCommerciaux(): Promise<PerformanceCommercial[]> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/commerciaux`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<PerformanceCommercial[]>(response);
}

/**
 * Récupère le statut de tous les channels WhatsApp
 */
export async function getStatutChannels(): Promise<StatutChannel[]> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/channels`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<StatutChannel[]>(response);
}

/**
 * Récupère les données de performance sur une période
 * @param jours - Nombre de jours (défaut: 7)
 */
export async function getPerformanceTemporelle(jours: number = 7): Promise<PerformanceTemporelle[]> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/performance-temporelle?jours=${jours}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<PerformanceTemporelle[]>(response);
}

/**
 * Récupère toutes les données du dashboard en une seule requête
 * C'est l'endpoint le plus optimisé pour charger le dashboard
 */
export async function getOverviewMetriques() {
    const response = await fetch(`${API_BASE_URL}/api/metriques/overview`, {
        method: 'GET',
        credentials: 'include',
    });
    
    const result = await handleResponse<{
        success: boolean;
        timestamp: string;
        data: {
            metriques: MetriquesGlobales;
            performanceCommercial: PerformanceCommercial[];
            statutChannels: StatutChannel[];
            performanceTemporelle: PerformanceTemporelle[];
        };
    }>(response);
    
    return result.data;
}

export async function getWebhookMetrics(): Promise<WebhookMetricsSnapshot> {
    const response = await fetch(`${API_BASE_URL}/metrics/webhook`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<WebhookMetricsSnapshot>(response);
}
