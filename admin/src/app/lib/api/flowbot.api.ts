import type { FlowBot, FlowNode, FlowEdge, FlowTrigger, FlowAnalyticsRow } from '../definitions';
import { API_BASE_URL, handleResponse } from './_http';

const BASE = `${API_BASE_URL}/flowbot`;

// ─── Flows ────────────────────────────────────────────────────────────────────

export async function getFlows(): Promise<FlowBot[]> {
    const res = await fetch(`${BASE}/flows`, { credentials: 'include' });
    return handleResponse<FlowBot[]>(res);
}

export async function getFlow(id: string): Promise<FlowBot> {
    const res = await fetch(`${BASE}/flows/${id}`, { credentials: 'include' });
    return handleResponse<FlowBot>(res);
}

export async function createFlow(dto: Partial<FlowBot>): Promise<FlowBot> {
    const res = await fetch(`${BASE}/flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
        credentials: 'include',
    });
    return handleResponse<FlowBot>(res);
}

export async function updateFlow(id: string, dto: Partial<FlowBot>): Promise<FlowBot> {
    const res = await fetch(`${BASE}/flows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
        credentials: 'include',
    });
    return handleResponse<FlowBot>(res);
}

export async function setFlowActive(id: string, isActive: boolean): Promise<FlowBot> {
    const res = await fetch(`${BASE}/flows/${id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
        credentials: 'include',
    });
    return handleResponse<FlowBot>(res);
}

export async function deleteFlow(id: string): Promise<void> {
    const res = await fetch(`${BASE}/flows/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!res.ok) await handleResponse<void>(res);
}

// ─── Nœuds ───────────────────────────────────────────────────────────────────

export async function upsertNodes(flowId: string, nodes: Partial<FlowNode>[]): Promise<FlowNode[]> {
    const res = await fetch(`${BASE}/flows/${flowId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nodes),
        credentials: 'include',
    });
    return handleResponse<FlowNode[]>(res);
}

export async function deleteNode(id: string): Promise<void> {
    const res = await fetch(`${BASE}/nodes/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!res.ok) await handleResponse<void>(res);
}

// ─── Arêtes ───────────────────────────────────────────────────────────────────

export async function upsertEdges(flowId: string, edges: Partial<FlowEdge>[]): Promise<FlowEdge[]> {
    const res = await fetch(`${BASE}/flows/${flowId}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edges),
        credentials: 'include',
    });
    return handleResponse<FlowEdge[]>(res);
}

export async function deleteEdge(id: string): Promise<void> {
    const res = await fetch(`${BASE}/edges/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!res.ok) await handleResponse<void>(res);
}

// ─── Triggers ─────────────────────────────────────────────────────────────────

export async function upsertTriggers(flowId: string, triggers: Partial<FlowTrigger>[]): Promise<FlowTrigger[]> {
    const res = await fetch(`${BASE}/flows/${flowId}/triggers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(triggers),
        credentials: 'include',
    });
    return handleResponse<FlowTrigger[]>(res);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getFlowAnalytics(flowId: string): Promise<FlowAnalyticsRow[]> {
    const res = await fetch(`${BASE}/flows/${flowId}/analytics`, { credentials: 'include' });
    return handleResponse<FlowAnalyticsRow[]>(res);
}

// ─── Providers ────────────────────────────────────────────────────────────────

export async function getRegisteredProviders(): Promise<string[]> {
    const res = await fetch(`${BASE}/providers`, { credentials: 'include' });
    const data = await handleResponse<{ providers: string[] }>(res);
    return data.providers;
}
