'use client';

import React, { useState, useCallback } from 'react';
import type {
    FlowNode, FlowEdge, FlowTrigger, FlowNodeType, FlowTriggerType,
    FlowSession, FlowSessionLog,
} from '@/app/lib/definitions';
import { useFlowBuilder } from '../hooks/useFlowBuilder';
import { useFlows } from '../hooks/useFlows';
import {
    getFlowAnalytics, getFlowSessions, getSessionLogs, cancelSession,
} from '../api/flowbot.api';
import type { FlowAnalyticsRow } from '@/app/lib/definitions';
import { NODE_TYPE_LABELS, TRIGGER_LABELS } from './FlowListView';

interface FlowBuilderViewProps {
    flowId: string;
    onBack: () => void;
}

const NODE_TYPE_OPTIONS: FlowNodeType[] = ['MESSAGE', 'QUESTION', 'CONDITION', 'ACTION', 'WAIT', 'ESCALATE', 'END', 'AB_TEST'];
const TRIGGER_TYPE_OPTIONS: FlowTriggerType[] = [
    'INBOUND_MESSAGE', 'CONVERSATION_OPEN', 'CONVERSATION_REOPEN', 'OUT_OF_HOURS',
    'ON_ASSIGN', 'QUEUE_WAIT', 'NO_RESPONSE', 'INACTIVITY', 'KEYWORD', 'SCHEDULE',
];
const CHANNEL_TYPE_OPTIONS = ['', 'whatsapp', 'telegram', 'messenger', 'instagram'];
const PROVIDER_OPTIONS = ['', 'whapi', 'meta'];

const NODE_COLORS: Record<string, string> = {
    MESSAGE: 'bg-blue-50 border-blue-200 text-blue-800',
    QUESTION: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    CONDITION: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    ACTION: 'bg-teal-50 border-teal-200 text-teal-800',
    WAIT: 'bg-orange-50 border-orange-200 text-orange-800',
    ESCALATE: 'bg-red-50 border-red-200 text-red-800',
    END: 'bg-gray-100 border-gray-300 text-gray-700',
    AB_TEST: 'bg-purple-50 border-purple-200 text-purple-800',
};

const SESSION_STATUS_STYLE: Record<string, string> = {
    active: 'bg-blue-100 text-blue-700',
    waiting_reply: 'bg-indigo-100 text-indigo-700',
    waiting_delay: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    escalated: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-500',
    cancelled: 'bg-gray-100 text-gray-400 line-through',
};

const SESSION_STATUS_LABELS: Record<string, string> = {
    active: 'Actif',
    waiting_reply: 'Att. réponse',
    waiting_delay: 'Att. délai',
    completed: 'Terminé',
    escalated: 'Escaladé',
    expired: 'Expiré',
    cancelled: 'Annulé',
};

type Tab = 'nodes' | 'edges' | 'triggers' | 'analytics' | 'sessions';

export default function FlowBuilderView({ flowId, onBack }: FlowBuilderViewProps) {
    const { flow, loading, error, saving, reload, saveNodes, removeNode, saveEdges, removeEdge, saveTriggers, removeTrigger } = useFlowBuilder(flowId);
    const { update } = useFlows();
    const [tab, setTab] = useState<Tab>('nodes');
    const [analytics, setAnalytics] = useState<FlowAnalyticsRow[]>([]);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [sessions, setSessions] = useState<FlowSession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [expandedSession, setExpandedSession] = useState<string | null>(null);
    const [sessionLogs, setSessionLogs] = useState<Record<string, FlowSessionLog[]>>({});

    const [editingNode, setEditingNode] = useState<Partial<FlowNode> | null>(null);
    const [nodeError, setNodeError] = useState<string | null>(null);
    const [editingEdge, setEditingEdge] = useState<Partial<FlowEdge> | null>(null);
    const [edgeError, setEdgeError] = useState<string | null>(null);
    const [editingTrigger, setEditingTrigger] = useState<Partial<FlowTrigger> | null>(null);
    const [triggerError, setTriggerError] = useState<string | null>(null);

    // Meta edit
    const [editMeta, setEditMeta] = useState(false);
    const [metaName, setMetaName] = useState('');
    const [metaDesc, setMetaDesc] = useState('');
    const [metaPriority, setMetaPriority] = useState(0);
    const [metaChannel, setMetaChannel] = useState('');
    const [metaProvider, setMetaProvider] = useState('');

    const loadAnalytics = useCallback(async () => {
        setAnalyticsLoading(true);
        try {
            const data = await getFlowAnalytics(flowId);
            setAnalytics(data);
        } finally {
            setAnalyticsLoading(false);
        }
    }, [flowId]);

    const loadSessions = useCallback(async () => {
        setSessionsLoading(true);
        try {
            const data = await getFlowSessions(flowId, 30);
            setSessions(data);
        } finally {
            setSessionsLoading(false);
        }
    }, [flowId]);

    const handleTabChange = (t: Tab) => {
        setTab(t);
        if (t === 'analytics') void loadAnalytics();
        if (t === 'sessions') void loadSessions();
    };

    const handleExpandSession = async (sessionId: string) => {
        if (expandedSession === sessionId) { setExpandedSession(null); return; }
        setExpandedSession(sessionId);
        if (!sessionLogs[sessionId]) {
            const logs = await getSessionLogs(sessionId);
            setSessionLogs(prev => ({ ...prev, [sessionId]: logs }));
        }
    };

    const handleCancelSession = async (sessionId: string) => {
        await cancelSession(sessionId);
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: 'cancelled' as const } : s));
    };

    const handleSaveNode = async () => {
        if (!editingNode) return;
        setNodeError(null);
        try {
            await saveNodes([editingNode]);
            setEditingNode(null);
        } catch (err) {
            setNodeError((err as Error).message);
        }
    };

    const handleSaveEdge = async () => {
        if (!editingEdge) return;
        setEdgeError(null);
        try {
            await saveEdges([editingEdge]);
            setEditingEdge(null);
        } catch (err) {
            setEdgeError((err as Error).message);
        }
    };

    const handleSaveTrigger = async () => {
        if (!editingTrigger) return;
        setTriggerError(null);
        try {
            await saveTriggers([editingTrigger]);
            setEditingTrigger(null);
        } catch (err) {
            setTriggerError((err as Error).message);
        }
    };

    const handleSaveMeta = async () => {
        try {
            await update(flowId, {
                name: metaName,
                priority: metaPriority,
                description: metaDesc || undefined,
                scopeChannelType: metaChannel || undefined,
                scopeProviderRef: metaProvider || undefined,
            });
            await reload();
            setEditMeta(false);
        } catch (err) {
            alert((err as Error).message);
        }
    };

    const openMetaEdit = () => {
        if (!flow) return;
        setMetaName(flow.name);
        setMetaDesc(flow.description ?? '');
        setMetaPriority(flow.priority);
        setMetaChannel(flow.scopeChannelType ?? '');
        setMetaProvider(flow.scopeProviderRef ?? '');
        setEditMeta(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
        );
    }

    if (error || !flow) {
        return (
            <div className="text-center py-16">
                <p className="text-red-600">{error ?? 'Flux introuvable'}</p>
                <button onClick={onBack} className="mt-4 text-blue-600 hover:underline text-sm">← Retour à la liste</button>
            </div>
        );
    }

    const nodes = flow.nodes ?? [];
    const edges = flow.edges ?? [];
    const triggers = flow.triggers ?? [];

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start gap-4">
                <button onClick={onBack} className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-1 shrink-0">
                    ← Liste
                </button>
                <div className="h-4 w-px bg-gray-300 mt-1.5 shrink-0" />

                {editMeta ? (
                    <div className="flex-1 bg-white border border-blue-200 rounded-xl p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-700">Modifier le flux</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                                <input className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" value={metaName} onChange={e => setMetaName(e.target.value)} />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                <input className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" value={metaDesc} onChange={e => setMetaDesc(e.target.value)} placeholder="Description optionnelle" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Priorité</label>
                                <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" value={metaPriority} onChange={e => setMetaPriority(Number(e.target.value))} min={0} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Canal</label>
                                <select className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" value={metaChannel} onChange={e => setMetaChannel(e.target.value)}>
                                    <option value="">Tous les canaux</option>
                                    {CHANNEL_TYPE_OPTIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
                                <select className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" value={metaProvider} onChange={e => setMetaProvider(e.target.value)}>
                                    <option value="">Tous les providers</option>
                                    {PROVIDER_OPTIONS.filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setEditMeta(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg">Annuler</button>
                            <button onClick={() => void handleSaveMeta()} disabled={!metaName.trim()} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Enregistrer</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-start gap-3 flex-1">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-bold text-gray-900">{flow.name}</h2>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${flow.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {flow.isActive ? '● Actif' : '○ Inactif'}
                                </span>
                                {flow.priority > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Prio {flow.priority}</span>}
                                {flow.scopeChannelType && <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">📡 {flow.scopeChannelType}</span>}
                                {flow.scopeProviderRef && <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">🔌 {flow.scopeProviderRef}</span>}
                            </div>
                            {flow.description && <p className="text-sm text-gray-500 mt-0.5">{flow.description}</p>}
                        </div>
                        <button onClick={openMetaEdit} className="text-xs text-gray-400 hover:text-gray-600 shrink-0 mt-1">✏️ Modifier</button>
                    </div>
                )}

                {saving && <span className="text-xs text-blue-600 animate-pulse mt-1">Enregistrement...</span>}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                {(['nodes', 'edges', 'triggers', 'analytics', 'sessions'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => handleTabChange(t)}
                        className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === t ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        {t === 'nodes' ? `Nœuds (${nodes.length})`
                            : t === 'edges' ? `Liaisons (${edges.length})`
                            : t === 'triggers' ? `Déclencheurs (${triggers.length})`
                            : t === 'analytics' ? 'Analytics'
                            : 'Sessions'}
                    </button>
                ))}
            </div>

            {/* ── Onglet Nœuds ─────────────────────────────────────────────── */}
            {tab === 'nodes' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            onClick={() => setEditingNode({ type: 'MESSAGE', label: '', isEntryPoint: false, positionX: 0, positionY: 0, config: {} })}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            + Ajouter un nœud
                        </button>
                    </div>

                    {nodes.length === 0 && (
                        <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl text-gray-400">
                            Aucun nœud — commencez par ajouter un nœud d&apos;entrée
                        </div>
                    )}

                    <div className="relative">
                        {nodes.map((node, idx) => (
                            <div key={node.id} className="relative">
                                {idx > 0 && (
                                    <div className="flex justify-center my-1">
                                        <div className="w-px h-6 bg-gray-300" />
                                    </div>
                                )}
                                <NodeCard
                                    node={node}
                                    edges={edges}
                                    nodes={nodes}
                                    onEdit={() => setEditingNode({ ...node })}
                                    onDelete={() => void removeNode(node.id)}
                                />
                            </div>
                        ))}
                    </div>

                    {editingNode && (
                        <NodeForm
                            node={editingNode}
                            onChange={setEditingNode}
                            onSave={() => void handleSaveNode()}
                            onCancel={() => { setEditingNode(null); setNodeError(null); }}
                            error={nodeError}
                            saving={saving}
                        />
                    )}
                </div>
            )}

            {/* ── Onglet Liaisons ─────────────────────────────────────────── */}
            {tab === 'edges' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            onClick={() => setEditingEdge({ conditionType: 'always', conditionNegate: false, sortOrder: edges.length })}
                            disabled={nodes.length < 2}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            + Ajouter une liaison
                        </button>
                    </div>
                    {nodes.length < 2 && (
                        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                            Ajoutez au moins 2 nœuds avant de créer des liaisons.
                        </p>
                    )}
                    {edges.length === 0 && nodes.length >= 2 && (
                        <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl text-gray-400">
                            Aucune liaison — connectez vos nœuds
                        </div>
                    )}
                    <div className="space-y-2">
                        {edges.map(edge => (
                            <EdgeCard key={edge.id} edge={edge} nodes={nodes} onEdit={() => setEditingEdge({ ...edge })} onDelete={() => void removeEdge(edge.id)} />
                        ))}
                    </div>
                    {editingEdge && (
                        <EdgeForm
                            edge={editingEdge}
                            nodes={nodes}
                            onChange={setEditingEdge}
                            onSave={() => void handleSaveEdge()}
                            onCancel={() => { setEditingEdge(null); setEdgeError(null); }}
                            error={edgeError}
                            saving={saving}
                        />
                    )}
                </div>
            )}

            {/* ── Onglet Déclencheurs ─────────────────────────────────────── */}
            {tab === 'triggers' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            onClick={() => setEditingTrigger({ triggerType: 'INBOUND_MESSAGE', isActive: true, config: {} })}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            + Ajouter un déclencheur
                        </button>
                    </div>
                    {triggers.length === 0 && (
                        <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl text-gray-400">
                            Aucun déclencheur — le flux ne sera jamais activé
                        </div>
                    )}
                    <div className="space-y-2">
                        {triggers.map(trigger => (
                            <TriggerCard
                                key={trigger.id}
                                trigger={trigger}
                                onEdit={() => setEditingTrigger({ ...trigger })}
                                onDelete={() => void removeTrigger(trigger.id)}
                            />
                        ))}
                    </div>
                    {editingTrigger && (
                        <TriggerForm
                            trigger={editingTrigger}
                            onChange={setEditingTrigger}
                            onSave={() => void handleSaveTrigger()}
                            onCancel={() => { setEditingTrigger(null); setTriggerError(null); }}
                            error={triggerError}
                            saving={saving}
                        />
                    )}
                </div>
            )}

            {/* ── Onglet Analytics ────────────────────────────────────────── */}
            {tab === 'analytics' && (
                <div className="space-y-4">
                    {analyticsLoading ? (
                        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
                    ) : analytics.length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl text-gray-400">
                            Aucune donnée analytics — le flux n&apos;a pas encore été exécuté
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                                    <tr>
                                        {['Date', 'Démarrées', 'Complétées', 'Escaladées', 'Expirées', 'Moy. étapes', 'Moy. durée (s)'].map(h => (
                                            <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {analytics.map(row => (
                                        <tr key={row.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-mono">{row.periodDate}</td>
                                            <td className="px-4 py-3">{row.sessionsStarted}</td>
                                            <td className="px-4 py-3 text-green-700">{row.sessionsCompleted}</td>
                                            <td className="px-4 py-3 text-orange-600">{row.sessionsEscalated}</td>
                                            <td className="px-4 py-3 text-red-600">{row.sessionsExpired}</td>
                                            <td className="px-4 py-3">{row.avgSteps?.toFixed(1) ?? '—'}</td>
                                            <td className="px-4 py-3">{row.avgDurationSeconds?.toFixed(0) ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Onglet Sessions ─────────────────────────────────────────── */}
            {tab === 'sessions' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500">30 sessions les plus récentes</p>
                        <button onClick={() => void loadSessions()} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
                            Actualiser
                        </button>
                    </div>
                    {sessionsLoading ? (
                        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl text-gray-400">
                            Aucune session enregistrée pour ce flux
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sessions.map(session => (
                                <SessionRow
                                    key={session.id}
                                    session={session}
                                    nodes={nodes}
                                    logs={sessionLogs[session.id]}
                                    expanded={expandedSession === session.id}
                                    onToggle={() => void handleExpandSession(session.id)}
                                    onCancel={() => void handleCancelSession(session.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function NodeCard({ node, edges, nodes, onEdit, onDelete }: {
    node: FlowNode; edges: FlowEdge[]; nodes: FlowNode[];
    onEdit: () => void; onDelete: () => void;
}) {
    const outEdges = edges.filter(e => e.sourceNodeId === node.id);
    const colorClass = NODE_COLORS[node.type] ?? 'bg-gray-50 border-gray-200 text-gray-700';
    return (
        <div className={`rounded-lg border px-4 py-3 ${colorClass} flex items-start justify-between gap-4`}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    {node.isEntryPoint && <span className="text-xs font-bold bg-blue-200 text-blue-900 px-1.5 rounded">ENTRÉE</span>}
                    <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{NODE_TYPE_LABELS[node.type] ?? node.type}</span>
                    {node.timeoutSeconds && <span className="text-xs opacity-60">⏱ {node.timeoutSeconds}s</span>}
                </div>
                <p className="font-medium text-sm">{node.label || <span className="italic opacity-50">Sans libellé</span>}</p>
                {(node.config as { body?: string }).body && (
                    <p className="text-xs mt-1 opacity-60 truncate">"{(node.config as { body: string }).body}"</p>
                )}
                {outEdges.length > 0 && (
                    <p className="text-xs mt-1 opacity-50">
                        → {outEdges.map(e => nodes.find(n => n.id === e.targetNodeId)?.label || e.targetNodeId.slice(0, 8)).join(' | ')}
                    </p>
                )}
            </div>
            <div className="flex gap-1.5 shrink-0">
                <button onClick={onEdit} className="px-2 py-1 text-xs bg-white/60 border border-current/20 rounded hover:bg-white/90">Éditer</button>
                <button onClick={onDelete} className="px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100">×</button>
            </div>
        </div>
    );
}

function EdgeCard({ edge, nodes, onEdit, onDelete }: { edge: FlowEdge; nodes: FlowNode[]; onEdit: () => void; onDelete: () => void }) {
    const src = nodes.find(n => n.id === edge.sourceNodeId);
    const tgt = nodes.find(n => n.id === edge.targetNodeId);
    return (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0 text-sm">
                <span className="font-medium truncate max-w-32">{src?.label || src?.id.slice(0, 8) || '?'}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium truncate max-w-32">{tgt?.label || tgt?.id.slice(0, 8) || '?'}</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {edge.conditionNegate ? 'NON ' : ''}{edge.conditionType}{edge.conditionValue ? ` "${edge.conditionValue}"` : ''}
                </span>
                <span className="text-xs text-gray-400">ordre {edge.sortOrder}</span>
            </div>
            <div className="flex gap-1.5 shrink-0">
                <button onClick={onEdit} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">Éditer</button>
                <button onClick={onDelete} className="px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100">×</button>
            </div>
        </div>
    );
}

function TriggerCard({ trigger, onEdit, onDelete }: { trigger: FlowTrigger; onEdit: () => void; onDelete: () => void }) {
    const configSummary = () => {
        const cfg = trigger.config;
        if (trigger.triggerType === 'KEYWORD') {
            const kws = (cfg.keywords as string[] | undefined) ?? [];
            return kws.length ? `"${kws.join('", "')}"` : '';
        }
        if (trigger.triggerType === 'NO_RESPONSE') return `après ${String(cfg.timeoutSeconds ?? '?')}s`;
        if (trigger.triggerType === 'QUEUE_WAIT') return `après ${String(cfg.waitSeconds ?? '?')}s`;
        if (trigger.triggerType === 'INACTIVITY') return `après ${String(cfg.inactivitySeconds ?? '?')}s`;
        if (trigger.triggerType === 'SCHEDULE') return String(cfg.cronExpression ?? '');
        return '';
    };
    const summary = configSummary();
    return (
        <div className="bg-white border border-purple-100 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full ${trigger.isActive ? 'bg-green-400' : 'bg-gray-300'}`} />
                <span className="font-medium text-purple-800">{TRIGGER_LABELS[trigger.triggerType] ?? trigger.triggerType}</span>
                {summary && <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-100">{summary}</span>}
                {!trigger.isActive && <span className="text-xs text-gray-400">(inactif)</span>}
            </div>
            <div className="flex gap-1.5">
                <button onClick={onEdit} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">Éditer</button>
                <button onClick={onDelete} className="px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100">×</button>
            </div>
        </div>
    );
}

function SessionRow({ session, nodes, logs, expanded, onToggle, onCancel }: {
    session: FlowSession; nodes: FlowNode[]; logs?: FlowSessionLog[];
    expanded: boolean; onToggle: () => void; onCancel: () => void;
}) {
    const isTerminal = ['completed', 'escalated', 'expired', 'cancelled'].includes(session.status);
    const currentNode = nodes.find(n => n.id === session.currentNodeId);
    const startDate = new Date(session.startedAt);
    return (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-gray-50" onClick={onToggle}>
                <div className="flex items-center gap-3 text-sm flex-1 min-w-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SESSION_STATUS_STYLE[session.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {SESSION_STATUS_LABELS[session.status] ?? session.status}
                    </span>
                    <span className="text-gray-500 font-mono text-xs">{session.id.slice(0, 8)}…</span>
                    <span className="text-gray-500 text-xs truncate">conv: {session.conversationId.slice(0, 8)}…</span>
                    {currentNode && <span className="text-xs text-blue-600 truncate">@ {currentNode.label || currentNode.type}</span>}
                    <span className="text-xs text-gray-400 ml-auto">
                        {startDate.toLocaleDateString('fr-FR')} {startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs text-gray-400">{session.stepsCount} étapes</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {!isTerminal && (
                        <button
                            onClick={e => { e.stopPropagation(); onCancel(); }}
                            className="px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
                        >
                            Annuler
                        </button>
                    )}
                    <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                    {/* Variables de session */}
                    {Object.keys(session.variables).filter(k => !k.startsWith('__')).length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-gray-600 mb-1">Variables :</p>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(session.variables)
                                    .filter(([k]) => !k.startsWith('__'))
                                    .map(([k, v]) => (
                                        <span key={k} className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded font-mono">
                                            {k} = {String(v)}
                                        </span>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Logs */}
                    {logs === undefined ? (
                        <p className="text-xs text-gray-400">Chargement des logs…</p>
                    ) : logs.length === 0 ? (
                        <p className="text-xs text-gray-400">Aucun log enregistré</p>
                    ) : (
                        <div>
                            <p className="text-xs font-semibold text-gray-600 mb-1">Journal d&apos;exécution ({logs.length} entrées) :</p>
                            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            {['Heure', 'Type', 'Action', 'Résultat'].map(h => (
                                                <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {logs.map(log => (
                                            <tr key={log.id} className="hover:bg-gray-50">
                                                <td className="px-3 py-1.5 font-mono text-gray-400">
                                                    {new Date(log.executedAt).toLocaleTimeString('fr-FR')}
                                                </td>
                                                <td className="px-3 py-1.5">
                                                    <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                                        {log.nodeType ?? '—'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-1.5 text-gray-600">{log.action ?? '—'}</td>
                                                <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">{log.result ?? '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Formulaires ──────────────────────────────────────────────────────────────

function NodeForm({ node, onChange, onSave, onCancel, error, saving }: {
    node: Partial<FlowNode>; onChange: (n: Partial<FlowNode>) => void;
    onSave: () => void; onCancel: () => void; error: string | null; saving: boolean;
}) {
    const config = node.config ?? {};
    return (
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">{node.id ? 'Modifier le nœud' : 'Nouveau nœud'}</h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={node.type ?? 'MESSAGE'} onChange={e => onChange({ ...node, type: e.target.value as FlowNodeType })}>
                        {NODE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{NODE_TYPE_LABELS[t]}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Libellé</label>
                    <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={node.label ?? ''} onChange={e => onChange({ ...node, label: e.target.value })} placeholder="Ex: Message de bienvenue" />
                </div>

                {(node.type === 'MESSAGE' || node.type === 'QUESTION') && (
                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Corps du message
                            <span className="text-gray-400 font-normal ml-1">— Variables: {'{contact_name}'}, {'{current_time}'}, {'{session.CLE}'}</span>
                        </label>
                        <textarea
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            rows={3}
                            value={(config as { body?: string }).body ?? ''}
                            onChange={e => onChange({ ...node, config: { ...config, body: e.target.value } })}
                            placeholder="Bonjour {contact_name} ! Comment puis-je vous aider ?"
                        />
                    </div>
                )}

                {(node.type === 'MESSAGE' || node.type === 'QUESTION') && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Délai frappe (secondes)</label>
                        <input
                            type="number"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={(config as { typingDelaySeconds?: number }).typingDelaySeconds ?? 0}
                            onChange={e => onChange({ ...node, config: { ...config, typingDelaySeconds: Number(e.target.value) } })}
                            min={0} max={10}
                        />
                        <p className="text-xs text-gray-400 mt-1">Affiche "en train d'écrire…" avant d'envoyer</p>
                    </div>
                )}

                {node.type === 'MESSAGE' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">URL média (optionnel)</label>
                        <input
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={(config as { mediaUrl?: string }).mediaUrl ?? ''}
                            onChange={e => onChange({ ...node, config: { ...config, mediaUrl: e.target.value || undefined } })}
                            placeholder="https://example.com/image.jpg"
                        />
                    </div>
                )}

                {node.type === 'QUESTION' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Timeout sans réponse (secondes)</label>
                        <input
                            type="number"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={node.timeoutSeconds ?? ''}
                            onChange={e => onChange({ ...node, timeoutSeconds: e.target.value ? Number(e.target.value) : undefined })}
                            min={30}
                            placeholder="Ex: 300 (5 min) — vide = pas de timeout"
                        />
                        <p className="text-xs text-gray-400 mt-1">Si pas de réponse en N secondes → escalade</p>
                    </div>
                )}

                {node.type === 'WAIT' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Délai d&apos;attente (secondes)</label>
                        <input
                            type="number"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={(config as { delaySeconds?: number }).delaySeconds ?? 60}
                            onChange={e => onChange({ ...node, config: { ...config, delaySeconds: Number(e.target.value) } })}
                            min={10}
                        />
                    </div>
                )}

                {node.type === 'ACTION' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Type d&apos;action</label>
                        <select
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={(config as { actionType?: string }).actionType ?? 'set_variable'}
                            onChange={e => onChange({ ...node, config: { ...config, actionType: e.target.value } })}
                        >
                            <option value="set_variable">Définir variable</option>
                            <option value="set_contact_known">Marquer contact connu</option>
                            <option value="close_conversation">Fermer conversation</option>
                            <option value="send_typing">Indicateur frappe</option>
                            <option value="mark_as_read">Marquer comme lu</option>
                        </select>
                    </div>
                )}

                {node.type === 'ACTION' && (config as { actionType?: string }).actionType === 'set_variable' && (
                    <>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Nom de la variable</label>
                            <input
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                                value={(config as { key?: string }).key ?? ''}
                                onChange={e => onChange({ ...node, config: { ...config, key: e.target.value } })}
                                placeholder="Ex: order_id"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Valeur</label>
                            <input
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                value={(config as { value?: string }).value ?? ''}
                                onChange={e => onChange({ ...node, config: { ...config, value: e.target.value } })}
                                placeholder="Valeur ou {session.last_message_text}"
                            />
                        </div>
                    </>
                )}

                {node.type === 'ESCALATE' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Agent spécifique (UUID, optionnel)</label>
                        <input
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                            value={(config as { agentRef?: string }).agentRef ?? ''}
                            onChange={e => onChange({ ...node, config: { ...config, agentRef: e.target.value || undefined } })}
                            placeholder="Vide = agent libre"
                        />
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        id="entryPoint"
                        checked={node.isEntryPoint ?? false}
                        onChange={e => onChange({ ...node, isEntryPoint: e.target.checked })}
                    />
                    <label htmlFor="entryPoint" className="text-sm text-gray-700">Nœud d&apos;entrée (point de départ du flux)</label>
                </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
            <div className="flex justify-end gap-3 mt-4">
                <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">Annuler</button>
                <button onClick={onSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
            </div>
        </div>
    );
}

function EdgeForm({ edge, nodes, onChange, onSave, onCancel, error, saving }: {
    edge: Partial<FlowEdge>; nodes: FlowNode[];
    onChange: (e: Partial<FlowEdge>) => void; onSave: () => void; onCancel: () => void; error: string | null; saving: boolean;
}) {
    return (
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">{edge.id ? 'Modifier la liaison' : 'Nouvelle liaison'}</h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nœud source</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={edge.sourceNodeId ?? ''} onChange={e => onChange({ ...edge, sourceNodeId: e.target.value })}>
                        <option value="">— Sélectionner —</option>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.label || n.type} ({n.id.slice(0, 8)})</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nœud cible</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={edge.targetNodeId ?? ''} onChange={e => onChange({ ...edge, targetNodeId: e.target.value })}>
                        <option value="">— Sélectionner —</option>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.label || n.type} ({n.id.slice(0, 8)})</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type de condition</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={edge.conditionType ?? 'always'} onChange={e => onChange({ ...edge, conditionType: e.target.value })}>
                        <option value="always">Toujours (toujours vrai)</option>
                        <option value="message_contains">Message contient</option>
                        <option value="message_equals">Message égal à</option>
                        <option value="message_matches_regex">Regex</option>
                        <option value="contact_is_new">Contact nouveau</option>
                        <option value="channel_type">Type de canal</option>
                        <option value="agent_assigned">Agent assigné</option>
                        <option value="variable_equals">Variable égale (CLE=VALEUR)</option>
                    </select>
                </div>
                {edge.conditionType && !['always', 'contact_is_new', 'agent_assigned'].includes(edge.conditionType) && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            {edge.conditionType === 'channel_type' ? 'Canal (whatsapp/telegram/…)'
                                : edge.conditionType === 'variable_equals' ? 'Format CLE=VALEUR'
                                : edge.conditionType === 'message_matches_regex' ? 'Expression régulière'
                                : 'Valeur à rechercher'}
                        </label>
                        <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={edge.conditionValue ?? ''} onChange={e => onChange({ ...edge, conditionValue: e.target.value })} placeholder={
                            edge.conditionType === 'variable_equals' ? 'Ex: service_choisi=support'
                            : edge.conditionType === 'channel_type' ? 'whatsapp'
                            : edge.conditionType === 'message_matches_regex' ? '^(oui|yes|1)$'
                            : 'valeur…'
                        } />
                    </div>
                )}
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ordre de priorité</label>
                    <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={edge.sortOrder ?? 0} onChange={e => onChange({ ...edge, sortOrder: Number(e.target.value) })} min={0} />
                    <p className="text-xs text-gray-400 mt-1">Plus petit = évalué en premier</p>
                </div>
                <div className="flex items-center gap-3">
                    <input type="checkbox" id="negate" checked={edge.conditionNegate ?? false} onChange={e => onChange({ ...edge, conditionNegate: e.target.checked })} />
                    <label htmlFor="negate" className="text-sm text-gray-700">Inverser la condition (NON)</label>
                </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
            <div className="flex justify-end gap-3 mt-4">
                <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">Annuler</button>
                <button onClick={onSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
            </div>
        </div>
    );
}

function TriggerForm({ trigger, onChange, onSave, onCancel, error, saving }: {
    trigger: Partial<FlowTrigger>; onChange: (t: Partial<FlowTrigger>) => void;
    onSave: () => void; onCancel: () => void; error: string | null; saving: boolean;
}) {
    const cfg = trigger.config ?? {};

    // Helper pour mettre à jour une clé de config
    const setConfig = (key: string, value: unknown) =>
        onChange({ ...trigger, config: { ...cfg, [key]: value } });

    // Gestion des mots-clés : affichage en textarea (une par ligne)
    const keywordsText = ((cfg.keywords as string[] | undefined) ?? []).join('\n');
    const setKeywords = (text: string) =>
        setConfig('keywords', text.split('\n').map(s => s.trim()).filter(Boolean));

    return (
        <div className="bg-white rounded-xl border border-purple-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">{trigger.id ? 'Modifier le déclencheur' : 'Nouveau déclencheur'}</h3>
            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type de déclencheur</label>
                    <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={trigger.triggerType ?? 'INBOUND_MESSAGE'}
                        onChange={e => onChange({ ...trigger, triggerType: e.target.value as FlowTriggerType, config: {} })}
                    >
                        {TRIGGER_TYPE_OPTIONS.map(t => <option key={t} value={t}>{TRIGGER_LABELS[t] ?? t}</option>)}
                    </select>
                </div>

                {/* ── Config spécifique au type ── */}

                {trigger.triggerType === 'KEYWORD' && (
                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Mots-clés (un par ligne, insensible à la casse)
                        </label>
                        <textarea
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                            rows={4}
                            value={keywordsText}
                            onChange={e => setKeywords(e.target.value)}
                            placeholder={'aide\nhelp\nbonjour\nsupport'}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Le déclencheur s'active si le message du client <em>contient</em> l'un de ces mots.
                        </p>
                    </div>
                )}

                {trigger.triggerType === 'NO_RESPONSE' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Délai sans réponse (secondes)</label>
                        <input
                            type="number"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={(cfg.timeoutSeconds as number | undefined) ?? 300}
                            onChange={e => setConfig('timeoutSeconds', Number(e.target.value))}
                            min={60}
                        />
                        <p className="text-xs text-gray-400 mt-1">Évalué par job cron (précision ±1 min)</p>
                    </div>
                )}

                {trigger.triggerType === 'QUEUE_WAIT' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Délai d&apos;attente en queue (secondes)</label>
                        <input
                            type="number"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={(cfg.waitSeconds as number | undefined) ?? 120}
                            onChange={e => setConfig('waitSeconds', Number(e.target.value))}
                            min={60}
                        />
                        <p className="text-xs text-gray-400 mt-1">Évalué par job cron (précision ±1 min)</p>
                    </div>
                )}

                {trigger.triggerType === 'INACTIVITY' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Durée d&apos;inactivité (secondes)</label>
                        <input
                            type="number"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={(cfg.inactivitySeconds as number | undefined) ?? 3600}
                            onChange={e => setConfig('inactivitySeconds', Number(e.target.value))}
                            min={300}
                        />
                        <p className="text-xs text-gray-400 mt-1">Aucune activité (ni agent, ni client) depuis N secondes</p>
                    </div>
                )}

                {trigger.triggerType === 'SCHEDULE' && (
                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Expression cron</label>
                        <input
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                            value={(cfg.cronExpression as string | undefined) ?? ''}
                            onChange={e => setConfig('cronExpression', e.target.value)}
                            placeholder="0 9 * * 1-5"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Format : minute heure jour mois jour_semaine
                            — Ex: <code>0 9 * * 1-5</code> = lun-ven à 9h00
                        </p>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        id="tActive"
                        checked={trigger.isActive ?? true}
                        onChange={e => onChange({ ...trigger, isActive: e.target.checked })}
                    />
                    <label htmlFor="tActive" className="text-sm text-gray-700">Déclencheur actif</label>
                </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
            <div className="flex justify-end gap-3 mt-4">
                <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">Annuler</button>
                <button onClick={onSave} disabled={saving} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
            </div>
        </div>
    );
}
