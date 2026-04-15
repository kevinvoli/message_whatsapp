'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FlowBot, FlowNode, FlowEdge, FlowTrigger } from '@/app/lib/definitions';
import {
    getFlow,
    upsertNodes,
    deleteNode,
    upsertEdges,
    deleteEdge,
    upsertTriggers,
    deleteTrigger,
    getAvailableContexts,
} from '../api/flowbot.api';

export interface ContextSummary {
    id: string;
    label: string | null;
    contextType: string;
}

export interface UseFlowBuilderReturn {
    flow: FlowBot | null;
    loading: boolean;
    error: string | null;
    saving: boolean;
    availableContexts: ContextSummary[];
    reload: () => Promise<void>;
    saveNodes: (nodes: Partial<FlowNode>[]) => Promise<FlowNode[]>;
    removeNode: (nodeId: string) => Promise<void>;
    saveEdges: (edges: Partial<FlowEdge>[]) => Promise<FlowEdge[]>;
    removeEdge: (edgeId: string) => Promise<void>;
    saveTriggers: (triggers: Partial<FlowTrigger>[]) => Promise<FlowTrigger[]>;
    removeTrigger: (triggerId: string) => Promise<void>;
}

export function useFlowBuilder(flowId: string | null): UseFlowBuilderReturn {
    const [flow, setFlow] = useState<FlowBot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [availableContexts, setAvailableContexts] = useState<ContextSummary[]>([]);

    const reload = useCallback(async () => {
        if (!flowId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getFlow(flowId);
            setFlow(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [flowId]);

    useEffect(() => {
        void reload();
        void getAvailableContexts().then(setAvailableContexts).catch(() => null);
    }, [reload]);

    const saveNodes = useCallback(async (nodes: Partial<FlowNode>[]): Promise<FlowNode[]> => {
        if (!flowId) throw new Error('No flow selected');
        setSaving(true);
        try {
            const saved = await upsertNodes(flowId, nodes);
            await reload();
            return saved;
        } finally {
            setSaving(false);
        }
    }, [flowId, reload]);

    const removeNode = useCallback(async (nodeId: string) => {
        setSaving(true);
        try {
            await deleteNode(nodeId);
            await reload();
        } finally {
            setSaving(false);
        }
    }, [reload]);

    const saveEdges = useCallback(async (edges: Partial<FlowEdge>[]): Promise<FlowEdge[]> => {
        if (!flowId) throw new Error('No flow selected');
        setSaving(true);
        try {
            const saved = await upsertEdges(flowId, edges);
            await reload();
            return saved;
        } finally {
            setSaving(false);
        }
    }, [flowId, reload]);

    const removeEdge = useCallback(async (edgeId: string) => {
        setSaving(true);
        try {
            await deleteEdge(edgeId);
            await reload();
        } finally {
            setSaving(false);
        }
    }, [reload]);

    const saveTriggers = useCallback(async (triggers: Partial<FlowTrigger>[]): Promise<FlowTrigger[]> => {
        if (!flowId) throw new Error('No flow selected');
        setSaving(true);
        try {
            const saved = await upsertTriggers(flowId, triggers);
            await reload();
            return saved;
        } finally {
            setSaving(false);
        }
    }, [flowId, reload]);

    const removeTrigger = useCallback(async (triggerId: string) => {
        setSaving(true);
        try {
            await deleteTrigger(triggerId);
            await reload();
        } finally {
            setSaving(false);
        }
    }, [reload]);

    return { flow, loading, error, saving, availableContexts, reload, saveNodes, removeNode, saveEdges, removeEdge, saveTriggers, removeTrigger };
}
