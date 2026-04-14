'use client';

import React, { useState } from 'react';
import type { FlowBot } from '@/app/lib/definitions';
import { useFlows } from '../hooks/useFlows';

interface FlowListViewProps {
    onOpenBuilder: (flowId: string) => void;
}

const NODE_TYPE_LABELS: Record<string, string> = {
    MESSAGE: 'Message', QUESTION: 'Question', CONDITION: 'Condition',
    ACTION: 'Action', WAIT: 'Attente', ESCALATE: 'Escalade',
    END: 'Fin', AB_TEST: 'A/B Test',
};

const TRIGGER_LABELS: Record<string, string> = {
    INBOUND_MESSAGE: 'Message entrant', CONVERSATION_OPEN: 'Ouverture',
    CONVERSATION_REOPEN: 'Réouverture', OUT_OF_HOURS: 'Hors horaires',
    ON_ASSIGN: 'Assignation', QUEUE_WAIT: 'Attente queue',
    NO_RESPONSE: 'Sans réponse', INACTIVITY: 'Inactivité',
    KEYWORD: 'Mot-clé', SCHEDULE: 'Planifié',
};

export default function FlowListView({ onOpenBuilder }: FlowListViewProps) {
    const { flows, loading, error, refresh, create, toggleActive, remove } = useFlows();
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        try {
            const flow = await create({ name: newName.trim(), description: newDesc.trim() || undefined, priority: 0, isActive: false });
            setCreating(false);
            setNewName('');
            setNewDesc('');
            onOpenBuilder(flow.id);
        } catch (err) {
            alert((err as Error).message);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await remove(id);
            setConfirmDelete(null);
        } catch (err) {
            alert((err as Error).message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">FlowBot — Flux conversationnels</h2>
                    <p className="text-sm text-gray-500 mt-1">Créez et gérez vos flux de conversation automatisés</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => void refresh()}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Actualiser
                    </button>
                    <button
                        onClick={() => setCreating(true)}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        + Nouveau flux
                    </button>
                </div>
            </div>

            {/* Formulaire création */}
            {creating && (
                <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4">Nouveau flux</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                            <input
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="Ex: Accueil client"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <input
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={newDesc}
                                onChange={e => setNewDesc(e.target.value)}
                                placeholder="Description optionnelle"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            onClick={() => { setCreating(false); setNewName(''); setNewDesc(''); }}
                            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={() => void handleCreate()}
                            disabled={!newName.trim()}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            Créer et éditer
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {loading && (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
            )}

            {!loading && flows.length === 0 && !error && (
                <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                    <p className="text-gray-400 text-lg">Aucun flux configuré</p>
                    <p className="text-gray-400 text-sm mt-1">Créez votre premier flux conversationnel</p>
                </div>
            )}

            {/* Liste des flows */}
            <div className="grid gap-4">
                {flows.map(flow => (
                    <FlowCard
                        key={flow.id}
                        flow={flow}
                        onOpen={() => onOpenBuilder(flow.id)}
                        onToggle={() => void toggleActive(flow.id, !flow.isActive)}
                        onDelete={() => setConfirmDelete(flow.id)}
                    />
                ))}
            </div>

            {/* Modal confirmation suppression */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
                        <h3 className="font-semibold text-gray-900 mb-2">Supprimer ce flux ?</h3>
                        <p className="text-sm text-gray-500 mb-5">Cette action est irréversible. Tous les nœuds, arêtes et sessions associés seront supprimés.</p>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">Annuler</button>
                            <button onClick={() => void handleDelete(confirmDelete)} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Supprimer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function FlowCard({ flow, onOpen, onToggle, onDelete }: {
    flow: FlowBot;
    onOpen: () => void;
    onToggle: () => void;
    onDelete: () => void;
}) {
    const triggers = flow.triggers ?? [];
    const nodes = flow.nodes ?? [];

    return (
        <div className={`bg-white rounded-xl border shadow-sm transition-all hover:shadow-md ${flow.isActive ? 'border-green-200' : 'border-gray-200'}`}>
            <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-semibold text-gray-900 truncate">{flow.name}</h3>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${flow.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {flow.isActive ? '● Actif' : '○ Inactif'}
                            </span>
                            {flow.priority > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                                    Prio {flow.priority}
                                </span>
                            )}
                        </div>
                        {flow.description && (
                            <p className="text-sm text-gray-500 truncate">{flow.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                            {triggers.slice(0, 3).map(t => (
                                <span key={t.id} className="inline-flex items-center px-2 py-0.5 text-xs bg-purple-50 text-purple-700 rounded-full border border-purple-100">
                                    {TRIGGER_LABELS[t.triggerType] ?? t.triggerType}
                                    {t.triggerType === 'KEYWORD' && t.config?.keyword ? ` "${t.config.keyword as string}"` : ''}
                                </span>
                            ))}
                            {triggers.length > 3 && (
                                <span className="text-xs text-gray-400">+{triggers.length - 3}</span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400">{nodes.length} nœud{nodes.length > 1 ? 's' : ''}</span>
                        <button
                            onClick={onOpen}
                            className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                            Éditer
                        </button>
                        <button
                            onClick={onToggle}
                            className={`px-3 py-1.5 text-xs border rounded-lg transition-colors ${flow.isActive ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}
                        >
                            {flow.isActive ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                            onClick={onDelete}
                            className="px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                        >
                            Suppr.
                        </button>
                    </div>
                </div>

                {/* Aperçu des nœuds */}
                {nodes.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex flex-wrap gap-1.5">
                            {nodes.slice(0, 8).map(n => (
                                <span
                                    key={n.id}
                                    className={`inline-flex items-center px-2 py-0.5 text-xs rounded border ${n.isEntryPoint ? 'bg-blue-100 border-blue-300 text-blue-800 font-medium' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                                >
                                    {n.isEntryPoint ? '▶ ' : ''}{NODE_TYPE_LABELS[n.type] ?? n.type}{n.label ? ` — ${n.label}` : ''}
                                </span>
                            ))}
                            {nodes.length > 8 && (
                                <span className="text-xs text-gray-400 self-center">+{nodes.length - 8}</span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export { NODE_TYPE_LABELS, TRIGGER_LABELS };
