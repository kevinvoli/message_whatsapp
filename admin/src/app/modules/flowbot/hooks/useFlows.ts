'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FlowBot } from '@/app/lib/definitions';
import { getFlows, createFlow, updateFlow, setFlowActive, deleteFlow } from '../api/flowbot.api';

export interface UseFlowsReturn {
    flows: FlowBot[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    create: (dto: Partial<FlowBot>) => Promise<FlowBot>;
    update: (id: string, dto: Partial<FlowBot>) => Promise<FlowBot>;
    toggleActive: (id: string, isActive: boolean) => Promise<void>;
    remove: (id: string) => Promise<void>;
}

export function useFlows(): UseFlowsReturn {
    const [flows, setFlows] = useState<FlowBot[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getFlows();
            setFlows(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const create = useCallback(async (dto: Partial<FlowBot>): Promise<FlowBot> => {
        const created = await createFlow(dto);
        setFlows(prev => [...prev, created]);
        return created;
    }, []);

    const update = useCallback(async (id: string, dto: Partial<FlowBot>): Promise<FlowBot> => {
        const updated = await updateFlow(id, dto);
        setFlows(prev => prev.map(f => f.id === id ? updated : f));
        return updated;
    }, []);

    const toggleActive = useCallback(async (id: string, isActive: boolean) => {
        const updated = await setFlowActive(id, isActive);
        setFlows(prev => prev.map(f => f.id === id ? updated : f));
    }, []);

    const remove = useCallback(async (id: string) => {
        await deleteFlow(id);
        setFlows(prev => prev.filter(f => f.id !== id));
    }, []);

    return { flows, loading, error, refresh, create, update, toggleActive, remove };
}
