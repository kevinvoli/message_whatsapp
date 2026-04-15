'use client';

import React, { useState, useCallback } from 'react';
import type { FlowNode, FlowEdge, FlowTrigger, FlowNodeType, FlowTriggerType } from '@/app/lib/definitions';
import { useFlowBuilder } from '../hooks/useFlowBuilder';
import { useFlows } from '../hooks/useFlows';
import { getFlowAnalytics } from '../api/flowbot.api';
import type { FlowAnalyticsRow } from '@/app/lib/definitions';
import { NODE_TYPE_LABELS, TRIGGER_LABELS } from './FlowListView';

interface FlowBuilderViewProps {
    flowId: string;
    onBack: () => void;
}

const NODE_TYPE_OPTIONS: FlowNodeType[] = ['MESSAGE', 'QUESTION', 'CONDITION', 'ACTION', 'WAIT', 'ESCALATE', 'END', 'AB_TEST'];
const TRIGGER_TYPE_OPTIONS: FlowTriggerType[] = ['INBOUND_MESSAGE', 'CONVERSATION_OPEN', 'CONVERSATION_REOPEN', 'OUT_OF_HOURS', 'ON_ASSIGN', 'QUEUE_WAIT', 'NO_RESPONSE', 'INACTIVITY', 'KEYWORD', 'SCHEDULE'];
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

type Tab = 'nodes' | 'edges' | 'triggers' | 'analytics';

export default function FlowBuilderView({ flowId, onBack }: FlowBuilderViewProps) {
    const { flow, loading, error, saving, reload, saveNodes, removeNode, saveEdges, removeEdge, saveTriggers, removeTrigger } = useFlowBuilder(flowId);
    const { update } = useFlows();
    const [tab, setTab] = useState<Tab>('nodes');
    const [analytics, setAnalytics] = useState<FlowAnalyticsRow[]>([]);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    // Node form state
    const [editingNode, setEditingNode] = useState<Partial<FlowNode> | null>(null);
    const [nodeError, setNodeError] = useState<string | null>(null);

    // Edge form state
    const [editingEdge, setEditingEdge] = useState<Partial<FlowEdge> | null>(null);
    const [edgeError, setEdgeError] = useState<string | null>(null);

    // Trigger form state
    const [editingTrigger, setEditingTrigger] = useState<Partial<FlowTrigger> | null>(null);
    const [triggerError, setTriggerError] = useState<string | null>(null);

    // Flow meta edit
    const [editMeta, setEditMeta] = useState(false);
    const [metaName, setMetaName] = useState('');
    const [metaPriority, setMetaPriority] = useState(0);

    const loadAnalytics = useCallback(async () => {
        setAnalyticsLoading(true);
        try {
            const data = await getFlowAnalytics(flowId);
            setAnalytics(data);
        } finally {
            setAnalyticsLoading(false);
        }
    }, [flowId]);

    const handleTabChange = (t: Tab) => {
        setTab(t);
        if (t === 'analytics') void loadAnalytics();
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
            await update(flowId, { name: metaName, priority: metaPriority });
            await reload();
            setEditMeta(false);
        } catch (err) {
            alert((err as Error).message);
        }
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
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    ← Liste des flux
                </button>
                <div className="h-4 w-px bg-gray-300" />
                {editMeta ? (
                    <div className="flex items-center gap-3 flex-1">
                        <input
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={metaName}
                            onChange={e => setMetaName(e.target.value)}
                        />
                        <input
                            type="number"
                            className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={metaPriority}
                            onChange={e => setMetaPriority(Number(e.target.value))}
                            placeholder="Prio"
                        />
                        <button onClick={() => void handleSaveMeta()} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg">Enregistrer</button>
                        <button onClick={() => setEditMeta(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg">Annuler</button>
                    </div>
                ) : (
                    <div className="flex items-center gap-3 flex-1">
                        <h2 className="text-xl font-bold text-gray-900">{flow.name}</h2>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${flow.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {flow.isActive ? '● Actif' : '○ Inactif'}
                        </span>
                        <button
                            onClick={() => { setMetaName(flow.name); setMetaPriority(flow.priority); setEditMeta(true); }}
                            className="text-xs text-gray-400 hover:text-gray-600"
                        >
                            ✏️ Renommer
                        </button>
                    </div>
                )}
                {saving && <span className="text-xs text-blue-600 animate-pulse">Enregistrement...</span>}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                {(['nodes', 'edges', 'triggers', 'analytics'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => handleTabChange(t)}
                        className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === t ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        {t === 'nodes' ? `Nœuds (${nodes.length})` : t === 'edges' ? `Liaisons (${edges.length})` : t === 'triggers' ? `Déclencheurs (${triggers.length})` : 'Analytics'}
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

                    {/* Visualisation verticale des nœuds */}
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

                    {/* Formulaire nœud */}
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
                            <TriggerCard key={trigger.id} trigger={trigger} onEdit={() => setEditingTrigger({ ...trigger })} onDelete={() => void removeTrigger(trigger.id)} />
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
        </div>
    );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function NodeCard({ node, edges, nodes, onEdit, onDelete }: {
    node: FlowNode;
    edges: FlowEdge[];
    nodes: FlowNode[];
    onEdit: () => void;
    onDelete: () => void;
}) {
    const outEdges = edges.filter(e => e.sourceNodeId === node.id);
    const colorClass = NODE_COLORS[node.type] ?? 'bg-gray-50 border-gray-200 text-gray-700';

    return (
        <div className={`rounded-lg border px-4 py-3 ${colorClass} flex items-start justify-between gap-4`}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    {node.isEntryPoint && <span className="text-xs font-bold bg-blue-200 text-blue-900 px-1.5 rounded">ENTRÉE</span>}
                    <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{NODE_TYPE_LABELS[node.type] ?? node.type}</span>
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
                <button onClick={onEdit} className="px-2 py-1 text-xs bg-white/60 border border-current/20 rounded hover:bg-white/90 transition-colors">Éditer</button>
                <button onClick={onDelete} className="px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors">×</button>
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
    return (
        <div className="bg-white border border-purple-100 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full ${trigger.isActive ? 'bg-green-400' : 'bg-gray-300'}`} />
                <span className="font-medium text-purple-800">{TRIGGER_LABELS[trigger.triggerType] ?? trigger.triggerType}</span>
                {!!trigger.config?.keyword && <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-100">&quot;{String(trigger.config.keyword)}&quot;</span>}
            </div>
            <div className="flex gap-1.5">
                <button onClick={onEdit} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">Éditer</button>
                <button onClick={onDelete} className="px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100">×</button>
            </div>
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
                        <label className="block text-xs font-medium text-gray-600 mb-1">Corps du message</label>
                        <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={3} value={(config as { body?: string }).body ?? ''} onChange={e => onChange({ ...node, config: { ...config, body: e.target.value } })} placeholder="Bonjour {contact_name} ! Comment puis-je vous aider ?" />
                        <p className="text-xs text-gray-400 mt-1">Variables: {'{contact_name}'}, {'{session.KEY}'}, {'{current_time}'}</p>
                    </div>
                )}
                {node.type === 'WAIT' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Délai (secondes)</label>
                        <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={node.timeoutSeconds ?? 60} onChange={e => onChange({ ...node, timeoutSeconds: Number(e.target.value) })} min={10} />
                    </div>
                )}
                {node.type === 'ACTION' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Action</label>
                        <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={(config as { action?: string }).action ?? 'set_contact_known'} onChange={e => onChange({ ...node, config: { ...config, action: e.target.value } })}>
                            <option value="set_contact_known">Marquer contact connu</option>
                            <option value="close_conversation">Fermer conversation</option>
                            <option value="send_typing">Indicateur frappe</option>
                            <option value="mark_as_read">Marquer comme lu</option>
                            <option value="set_variable">Définir variable</option>
                        </select>
                    </div>
                )}
                <div className="flex items-center gap-3">
                    <input type="checkbox" id="entryPoint" checked={node.isEntryPoint ?? false} onChange={e => onChange({ ...node, isEntryPoint: e.target.checked })} />
                    <label htmlFor="entryPoint" className="text-sm text-gray-700">Nœud d&apos;entrée (point de départ du flow)</label>
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={edge.conditionType ?? 'always'} onChange={e => onChange({ ...edge, conditionType: e.target.value })}>
                        <option value="always">Toujours</option>
                        <option value="message_contains">Message contient</option>
                        <option value="message_equals">Message égal à</option>
                        <option value="message_matches_regex">Regex</option>
                        <option value="contact_is_new">Contact nouveau</option>
                        <option value="channel_type">Type de canal</option>
                        <option value="agent_assigned">Agent assigné</option>
                        <option value="variable_equals">Variable égale</option>
                    </select>
                </div>
                {edge.conditionType && edge.conditionType !== 'always' && edge.conditionType !== 'contact_is_new' && edge.conditionType !== 'agent_assigned' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Valeur</label>
                        <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={edge.conditionValue ?? ''} onChange={e => onChange({ ...edge, conditionValue: e.target.value })} placeholder="valeur…" />
                    </div>
                )}
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ordre</label>
                    <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={edge.sortOrder ?? 0} onChange={e => onChange({ ...edge, sortOrder: Number(e.target.value) })} min={0} />
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
    return (
        <div className="bg-white rounded-xl border border-purple-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">{trigger.id ? 'Modifier le déclencheur' : 'Nouveau déclencheur'}</h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type de déclencheur</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={trigger.triggerType ?? 'INBOUND_MESSAGE'} onChange={e => onChange({ ...trigger, triggerType: e.target.value as FlowTriggerType })}>
                        {TRIGGER_TYPE_OPTIONS.map(t => <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>)}
                    </select>
                </div>
                {trigger.triggerType === 'KEYWORD' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Mot-clé</label>
                        <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={(trigger.config?.keyword as string) ?? ''} onChange={e => onChange({ ...trigger, config: { ...trigger.config, keyword: e.target.value } })} placeholder="Ex: aide, bonjour" />
                    </div>
                )}
                <div className="flex items-center gap-3">
                    <input type="checkbox" id="tActive" checked={trigger.isActive ?? true} onChange={e => onChange({ ...trigger, isActive: e.target.checked })} />
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
