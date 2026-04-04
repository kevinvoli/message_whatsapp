// admin/src/app/lib/api.ts

import { Commercial, StatsGlobales, Poste, Channel, MessageAuto, Client, WhatsappChat, WhatsappMessage, MetriquesGlobales, PerformanceCommercial, StatutChannel, PerformanceTemporelle, QueuePosition, DispatchSnapshot, DispatchSettings, DispatchSettingsAudit, WebhookMetricsSnapshot, AutoMessageScopeConfig, AutoMessageScopeType, CronConfig, UpdateCronConfigPayload, SystemConfigEntry, SystemConfigCatalogueEntry, WebhookEntry, PosteStats, CommercialStats } from './definitions';
import { logger } from './logger';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

// Fonction pour gérer les erreurs de fetch
async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        // Token expiré ou invalide → redirection immédiate vers la page de connexion
        if (response.status === 401 && typeof window !== 'undefined') {
            window.location.replace('/login');
        }
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

export async function getMessages(limit = 50, offset = 0, periode = 'today'): Promise<{ data: WhatsappMessage[]; total: number }> {
    const response = await fetch(`${API_BASE_URL}/messages?limit=${limit}&offset=${offset}&periode=${periode}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<{ data: WhatsappMessage[]; total: number }>(response);
}

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

export async function createCommercial(
  payload: {name: string; email: string; password: string; poste_id?: string | null },
): Promise<Commercial> {
    const response = await fetch(`${API_BASE_URL}/users`,{
        method: 'POST',
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

export async function getChannels(): Promise<Channel[]> {
    const response = await fetch(`${API_BASE_URL}/channel`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<Channel[]>(response);
}

export async function createChannel(channel: {
    token: string;
    label?: string;
    provider?: import('./definitions').ProviderType;
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

export async function refreshChannelToken(id: string): Promise<Channel> {
    const response = await fetch(`${API_BASE_URL}/channel/${id}/refresh-token`, {
        method: 'POST',
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

/**
 * Assigne ou désassigne un poste dédié à un channel.
 * @param channelId - channel_id du canal (ex: phone_number_id Meta)
 * @param posteId   - UUID du poste, ou null pour retour en pool global
 */
export async function assignChannelToPoste(channelId: string, posteId: string | null): Promise<Channel> {
    const response = await fetch(`${API_BASE_URL}/channel/${encodeURIComponent(channelId)}/assign-poste`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poste_id: posteId }),
        credentials: 'include',
    });
    return handleResponse<Channel>(response);
}

export async function getMessageAuto(): Promise<MessageAuto[]> {
    const response = await fetch(`${API_BASE_URL}/message-auto`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<MessageAuto[]>(response);
}

export async function createMessageAuto(messageAuto: Omit<MessageAuto, 'id' | 'createdAt' | 'updatedAt' | 'conditions' >): Promise<MessageAuto> {
    const response = await fetch(`${API_BASE_URL}/message-auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageAuto),
        credentials: 'include',
    });
    return handleResponse<MessageAuto>(response);
}

export async function updateMessageAuto(id: string, messageAuto: Partial<MessageAuto>): Promise<MessageAuto> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt, updatedAt, ...cleanPayload } = messageAuto as MessageAuto;
    const response = await fetch(`${API_BASE_URL}/message-auto/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanPayload),
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

export async function getScopeConfigs(): Promise<AutoMessageScopeConfig[]> {
    const response = await fetch(`${API_BASE_URL}/message-auto/scope-config`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<AutoMessageScopeConfig[]>(response);
}

export async function getScopeConfigsByType(type: AutoMessageScopeType): Promise<AutoMessageScopeConfig[]> {
    const response = await fetch(`${API_BASE_URL}/message-auto/scope-config/type/${type}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<AutoMessageScopeConfig[]>(response);
}

export async function upsertScopeConfig(payload: {
    scope_type: AutoMessageScopeType;
    scope_id: string;
    label?: string;
    enabled: boolean;
}): Promise<AutoMessageScopeConfig> {
    const response = await fetch(`${API_BASE_URL}/message-auto/scope-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    return handleResponse<AutoMessageScopeConfig>(response);
}

export async function deleteScopeConfig(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/message-auto/scope-config/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    return handleResponse<void>(response);
}

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

export async function getChats(
    limit = 50,
    offset = 0,
    periode = 'today',
    posteId?: string,
    commercialId?: string,
): Promise<{ data: WhatsappChat[]; total: number; totalUnread: number; totalFermes: number }> {
    const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        periode,
    });
    if (posteId) params.set('poste_id', posteId);
    if (commercialId) params.set('commercial_id', commercialId);
    const response = await fetch(`${API_BASE_URL}/chats?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
    });
    const result = await handleResponse<{ data: Array<Partial<WhatsappChat> & {
      unreadCount?: number;
      unread_count?: number;
      channel_id?: string;
      last_msg_client_channel_id?: string;
      client_phone?: string;
      contact_client?: string;
      status?: string;
    }>; total: number; totalUnread?: number; totalFermes?: number }>(response);
    return {
        data: result.data.map(normalizeWhatsappChat),
        total: result.total,
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, createdAt, updatedAt, ...cleanPayload } = payload as DispatchSettings & { id?: string; createdAt?: unknown; updatedAt?: unknown };
  
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

export async function redispatchAllWaiting(): Promise<{ dispatched: number; still_waiting: number }> {
    const response = await fetch(`${API_BASE_URL}/queue/dispatch/redispatch-all`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ dispatched: number; still_waiting: number }>(response);
}

export async function resetStuckConversations(): Promise<{ reset: number }> {
    const response = await fetch(`${API_BASE_URL}/queue/dispatch/reset-stuck`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<{ reset: number }>(response);
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

export async function getMessageCount(chat_id: string): Promise<number> {
    const response = await fetch(`${API_BASE_URL}/messages/${chat_id}/count`, {
        method: 'GET',
        credentials: 'include',
    });
    const result = await handleResponse<{ count: number }>(response);
    return result.count;
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

export async function getAdminProfile(): Promise<{ id: string; name: string; email: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/admin/profile`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<{ id: string; name: string; email: string }>(response);
}

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
export async function getPerformanceCommerciaux(periode = 'today'): Promise<PerformanceCommercial[]> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/commerciaux?periode=${periode}`, {
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
export async function getOverviewMetriques(periode = 'today', dateFrom?: string, dateTo?: string) {
    const params = new URLSearchParams({ periode });
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const response = await fetch(`${API_BASE_URL}/api/metriques/overview?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
    });

    const result = await handleResponse<{
        success: boolean;
        timestamp: string;
        computed_at?: string;
        from_snapshot?: boolean;
        data: {
            metriques: MetriquesGlobales;
            performanceCommercial: PerformanceCommercial[];
            statutChannels: StatutChannel[];
            performanceTemporelle: PerformanceTemporelle[];
        };
    }>(response);

    return { ...result.data, computed_at: result.computed_at, from_snapshot: result.from_snapshot };
}

export async function getOverviewSection<T>(
  section: 'globales' | 'commerciaux' | 'channels' | 'temporelle',
  periode = 'today',
  dateFrom?: string,
  dateTo?: string,
): Promise<T> {
  const params = new URLSearchParams({ periode, section });
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  const response = await fetch(`${API_BASE_URL}/api/metriques/overview?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  const result = await handleResponse<{
    success: boolean;
    data: T;
    computed_at?: string;
    from_snapshot?: boolean;
    section: string;
  }>(response);
  return result.data;
}

export async function refreshSnapshots(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/metriques/refresh-snapshots`, {
        method: 'POST',
        credentials: 'include',
    });
    await handleResponse<{ success: boolean }>(response);
}

export async function getWebhookMetrics(): Promise<WebhookMetricsSnapshot> {
    const response = await fetch(`${API_BASE_URL}/metrics/webhook`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<WebhookMetricsSnapshot>(response);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface AdminNotification {
    id: string;
    type: 'message' | 'queue' | 'alert' | 'info';
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
}

export function getNotificationStreamUrl(): string {
    return `${API_BASE_URL}/api/notifications/stream`;
}

export async function getNotifications(limit = 50, offset = 0): Promise<{ data: AdminNotification[]; total: number }> {
    const response = await fetch(`${API_BASE_URL}/api/notifications?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<{ data: AdminNotification[]; total: number }>(response);
}

export async function getUnreadCount(): Promise<number> {
    const response = await fetch(`${API_BASE_URL}/api/notifications/unread-count`, {
        method: 'GET',
        credentials: 'include',
    });
    const result = await handleResponse<{ count: number }>(response);
    return result.count;
}

export async function markNotificationRead(id: string): Promise<void> {
    await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
        method: 'PATCH',
        credentials: 'include',
    });
}

export async function markAllNotificationsRead(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
        method: 'PATCH',
        credentials: 'include',
    });
}

export async function clearAllNotifications(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'DELETE',
        credentials: 'include',
    });
}

// ─── Cron Config ──────────────────────────────────────────────────────────────

export async function getCronConfigs(): Promise<CronConfig[]> {
    const response = await fetch(`${API_BASE_URL}/cron-configs`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<CronConfig[]>(response);
}

export async function updateCronConfig(
    key: string,
    payload: UpdateCronConfigPayload,
): Promise<CronConfig> {
    const response = await fetch(`${API_BASE_URL}/cron-configs/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    return handleResponse<CronConfig>(response);
}

export async function resetCronConfig(key: string): Promise<CronConfig> {
    const response = await fetch(`${API_BASE_URL}/cron-configs/${key}/reset`, {
        method: 'POST',
        credentials: 'include',
    });
    return handleResponse<CronConfig>(response);
}

export async function getCronPreview(key: string): Promise<unknown> {
    const response = await fetch(`${API_BASE_URL}/cron-configs/${key}/preview`, {
        credentials: 'include',
    });
    return handleResponse<unknown>(response);
}

export async function runCronNow(key: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/cron-configs/${key}/run`, {
        method: 'POST',
        credentials: 'include',
    });
    await handleResponse<{ ok: boolean; ranAt: string }>(response);
}

// ─── System Config ────────────────────────────────────────────────────────────

export async function getSystemConfigs(): Promise<SystemConfigEntry[]> {
    const response = await fetch(`${API_BASE_URL}/system-config`, {
        credentials: 'include',
    });
    return handleResponse<SystemConfigEntry[]>(response);
}

export async function getSystemConfigCatalogue(): Promise<SystemConfigCatalogueEntry[]> {
    const response = await fetch(`${API_BASE_URL}/system-config/catalogue`, {
        credentials: 'include',
    });
    return handleResponse<SystemConfigCatalogueEntry[]>(response);
}

export async function updateSystemConfig(key: string, value: string): Promise<SystemConfigEntry> {
    const response = await fetch(`${API_BASE_URL}/system-config/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, value }),
    });
    return handleResponse<SystemConfigEntry>(response);
}

export async function getWebhookUrls(): Promise<WebhookEntry[]> {
    const response = await fetch(`${API_BASE_URL}/system-config/webhooks`, {
        credentials: 'include',
    });
    return handleResponse<WebhookEntry[]>(response);
}

export async function bulkUpdateSystemConfig(entries: { key: string; value: string }[]): Promise<{ updated: number }> {
    const response = await fetch(`${API_BASE_URL}/system-config/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entries }),
    });
    return handleResponse<{ updated: number }>(response);
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
