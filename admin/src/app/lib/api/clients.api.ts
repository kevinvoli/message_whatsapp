import { Client, ClientSummary, ClientDossier, OutcomeStats, ConversationResult } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

export async function getClients(limit = 50, offset = 0, search?: string): Promise<{ data: Client[]; total: number }> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search?.trim()) params.set('search', search.trim());
    const response = await fetch(`${API_BASE_URL}/contact?${params.toString()}`, {
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

export interface SearchClientsParams {
    search?: string;
    portfolio_owner_id?: string;
    source?: string;
    category?: string;
    limit?: number;
    offset?: number;
}

export async function searchClientsAdmin(
    params: SearchClientsParams = {},
): Promise<{ data: ClientSummary[]; total: number }> {
    const p = new URLSearchParams();
    if (params.search?.trim()) p.set('search', params.search.trim());
    if (params.portfolio_owner_id) p.set('portfolio_owner_id', params.portfolio_owner_id);
    if (params.source) p.set('source', params.source);
    if (params.category) p.set('category', params.category);
    p.set('limit', String(params.limit ?? 50));
    p.set('offset', String(params.offset ?? 0));
    const response = await fetch(`${API_BASE_URL}/clients?${p.toString()}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<{ data: ClientSummary[]; total: number }>(response);
}

export async function getClientDossierAdmin(contactId: string): Promise<ClientDossier> {
    const response = await fetch(`${API_BASE_URL}/clients/${contactId}/dossier`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<ClientDossier>(response);
}

export async function assignPortfolio(contactId: string, commercialId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/clients/${contactId}/portfolio`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commercial_id: commercialId }),
        credentials: 'include',
    });
    if (!response.ok) throw new Error('Erreur assignation portefeuille');
}

export async function unassignPortfolio(contactId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/clients/${contactId}/portfolio`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok) throw new Error('Erreur retrait portefeuille');
}

export async function getOutcomeStats(
    params: { commercial_id?: string; from?: string; to?: string } = {},
): Promise<OutcomeStats[]> {
    const p = new URLSearchParams();
    if (params.commercial_id) p.set('commercial_id', params.commercial_id);
    if (params.from) p.set('from', params.from);
    if (params.to) p.set('to', params.to);
    const response = await fetch(`${API_BASE_URL}/chats/stats/outcomes?${p.toString()}`, {
        method: 'GET',
        credentials: 'include',
    });
    return handleResponse<OutcomeStats[]>(response);
}
