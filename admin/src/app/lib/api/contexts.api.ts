import type {
  Context,
  ContextBinding,
  ChatContext,
  ChatContextsPage,
} from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

const BASE = `${API_BASE_URL}/contexts`;

// ─── Contexts ─────────────────────────────────────────────────────────────────

export async function getContexts(): Promise<Context[]> {
  const res = await fetch(BASE, { credentials: 'include' });
  return handleResponse<Context[]>(res);
}

export async function getContext(id: string): Promise<Context> {
  const res = await fetch(`${BASE}/${id}`, { credentials: 'include' });
  return handleResponse<Context>(res);
}

export async function createContext(dto: Partial<Context>): Promise<Context> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include',
  });
  return handleResponse<Context>(res);
}

export async function updateContext(id: string, dto: Partial<Context>): Promise<Context> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include',
  });
  return handleResponse<Context>(res);
}

export async function deleteContext(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) await handleResponse<void>(res);
}

// ─── Bindings ─────────────────────────────────────────────────────────────────

export async function addBinding(
  contextId: string,
  dto: Partial<ContextBinding>,
): Promise<ContextBinding> {
  const res = await fetch(`${BASE}/${contextId}/bindings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include',
  });
  return handleResponse<ContextBinding>(res);
}

export async function removeBinding(bindingId: string): Promise<void> {
  const res = await fetch(`${BASE}/bindings/${bindingId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) await handleResponse<void>(res);
}

// ─── ChatContexts par poste ───────────────────────────────────────────────────

export async function getChatContextsByPoste(
  posteId: string,
  limit = 20,
  cursor?: string,
): Promise<ChatContextsPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(
    `${BASE}/poste/${posteId}/chat-contexts?${params}`,
    { credentials: 'include' },
  );
  return handleResponse<ChatContextsPage>(res);
}
