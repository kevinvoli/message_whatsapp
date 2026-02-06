"use client";

import React, { useState, useEffect } from 'react';
import { MessageAuto } from '@/app/lib/definitions';
import { PlusCircle, Edit, Trash2, Save, XCircle } from 'lucide-react';
import { createMessageAuto, updateMessageAuto, deleteMessageAuto } from '@/app/lib/api';
import { Spinner } from './Spinner';

interface MessageAutoViewProps {
    initialMessagesAuto: MessageAuto[];
    onMessageAutoUpdated: () => void; // Callback to refresh data in parent
}

type AutoMessageChannel = 'whatsapp' | 'sms' | 'email'; // Re-define locally or import if available

export default function MessageAutoView({ initialMessagesAuto, onMessageAutoUpdated }: MessageAutoViewProps) {
    const [messagesAuto, setMessagesAuto] = useState<MessageAuto[]>(initialMessagesAuto);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [currentMessageAuto, setCurrentMessageAuto] = useState<MessageAuto | null>(null);
    const [formBody, setFormBody] = useState('');
    const [formDelai, setFormDelai] = useState<number | undefined>(undefined);
    const [formCanal, setFormCanal] = useState<AutoMessageChannel | undefined>(undefined);
    const [formPosition, setFormPosition] = useState(0);
    const [formActif, setFormActif] = useState(true);
    const [loading, setLoading] = useState(false);
    const [operationError, setOperationError] = useState<string | null>(null);

    useEffect(() => {
        setMessagesAuto(initialMessagesAuto);
    }, [initialMessagesAuto]);

    const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;

    const handleOpenAddModal = () => {
        setFormBody('');
        setFormDelai(undefined);
        setFormCanal(undefined);
        setFormPosition(0);
        setFormActif(true);
        setOperationError(null);
        setShowAddModal(true);
    };

    const handleCloseAddModal = () => {
        setShowAddModal(false);
        setOperationError(null);
    };

    const handleOpenEditModal = (message: MessageAuto) => {
        setCurrentMessageAuto(message);
        setFormBody(message.body);
        setFormDelai(message.delai ?? undefined);
        setFormCanal(message.canal ?? undefined);
        setFormPosition(message.position);
        setFormActif(message.actif);
        setOperationError(null);
        setShowEditModal(true);
    };

    const handleCloseEditModal = () => {
        setShowEditModal(false);
        setCurrentMessageAuto(null);
        setOperationError(null);
    };

    const handleAddMessageAuto = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) {
            setOperationError("Authentication token is missing.");
            return;
        }
        setLoading(true);
        setOperationError(null);
        try {
            await createMessageAuto(token, {
                body: formBody,
                delai: formDelai,
                canal: formCanal,
                position: formPosition,
                actif: formActif,
            });
            onMessageAutoUpdated();
            handleCloseAddModal();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to add automated message.");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateMessageAuto = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !currentMessageAuto) {
            setOperationError("Authentication token or message ID is missing.");
            return;
        }
        setLoading(true);
        setOperationError(null);
        try {
            await updateMessageAuto(token, currentMessageAuto.id, {
                body: formBody,
                delai: formDelai,
                canal: formCanal,
                position: formPosition,
                actif: formActif,
            });
            onMessageAutoUpdated();
            handleCloseEditModal();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to update automated message.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMessageAuto = async (id: string) => {
        if (!token || !window.confirm('Are you sure you want to delete this automated message?')) {
            return;
        }
        setLoading(true);
        setOperationError(null);
        try {
            await deleteMessageAuto(token, id);
            onMessageAutoUpdated();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to delete automated message.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Gestion des Messages Automatiques</h2>
                <button
                    onClick={handleOpenAddModal}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    disabled={loading}
                >
                    <PlusCircle className="w-4 h-4" />
                    Ajouter un message auto
                </button>
            </div>

            {operationError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                    <strong className="font-bold">Error:</strong>
                    <span className="block sm:inline"> {operationError}</span>
                </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Corps du message</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Délai (s)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Canal</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actif</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Créé le</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {messagesAuto.map((msg) => (
                                <tr key={msg.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{msg.position}</td>
                                    <td className="px-6 py-4 text-gray-700 max-w-xs truncate">{msg.body}</td>
                                    <td className="px-6 py-4 text-gray-700">{msg.delai ?? 'N/A'}</td>
                                    <td className="px-6 py-4 text-gray-700">{msg.canal ?? 'N/A'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            msg.actif ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {msg.actif ? 'Oui' : 'Non'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(msg.created_at).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleOpenEditModal(msg)}
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                disabled={loading}
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMessageAuto(msg.id)}
                                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                disabled={loading}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {messagesAuto.length === 0 && !loading && (
                        <p className="text-center text-gray-500 py-4">Aucun message automatique trouvé.</p>
                    )}
                    {loading && (
                        <div className="flex justify-center py-4">
                            <Spinner />
                        </div>
                    )}
                </div>
            </div>

            {/* Add MessageAuto Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
                    <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-semibold mb-4">Ajouter un nouveau message automatique</h3>
                        {operationError && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                                {operationError}
                            </div>
                        )}
                        <form onSubmit={handleAddMessageAuto}>
                            <div className="mb-4">
                                <label htmlFor="body" className="block text-gray-700 text-sm font-bold mb-2">Corps du message</label>
                                <textarea
                                    id="body"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formBody}
                                    onChange={(e) => setFormBody(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="delai" className="block text-gray-700 text-sm font-bold mb-2">Délai (secondes)</label>
                                <input
                                    type="number"
                                    id="delai"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formDelai ?? ''}
                                    onChange={(e) => setFormDelai(e.target.value ? parseInt(e.target.value) : undefined)}
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="canal" className="block text-gray-700 text-sm font-bold mb-2">Canal</label>
                                <select
                                    id="canal"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formCanal ?? ''}
                                    onChange={(e) => setFormCanal(e.target.value as AutoMessageChannel)}
                                >
                                    <option value="">Sélectionner un canal</option>
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="sms">SMS</option>
                                    <option value="email">Email</option>
                                </select>
                            </div>
                            <div className="mb-4">
                                <label htmlFor="position" className="block text-gray-700 text-sm font-bold mb-2">Position</label>
                                <input
                                    type="number"
                                    id="position"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formPosition}
                                    onChange={(e) => setFormPosition(parseInt(e.target.value))}
                                    required
                                />
                            </div>
                            <div className="mb-4 flex items-center">
                                <input
                                    type="checkbox"
                                    id="actif"
                                    className="mr-2 leading-tight"
                                    checked={formActif}
                                    onChange={(e) => setFormActif(e.target.checked)}
                                />
                                <label htmlFor="actif" className="text-gray-700 text-sm font-bold">Actif</label>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={handleCloseAddModal}
                                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
                                    disabled={loading}
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center"
                                    disabled={loading}
                                >
                                    {loading && <Spinner />}
                                    {loading ? 'Adding...' : 'Ajouter'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit MessageAuto Modal */}
            {showEditModal && currentMessageAuto && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
                    <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-semibold mb-4">Modifier le message automatique</h3>
                        {operationError && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                                {operationError}
                            </div>
                        )}
                        <form onSubmit={handleUpdateMessageAuto}>
                            <div className="mb-4">
                                <label htmlFor="edit-body" className="block text-gray-700 text-sm font-bold mb-2">Corps du message</label>
                                <textarea
                                    id="edit-body"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formBody}
                                    onChange={(e) => setFormBody(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="edit-delai" className="block text-gray-700 text-sm font-bold mb-2">Délai (secondes)</label>
                                <input
                                    type="number"
                                    id="edit-delai"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formDelai ?? ''}
                                    onChange={(e) => setFormDelai(e.target.value ? parseInt(e.target.value) : undefined)}
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="edit-canal" className="block text-gray-700 text-sm font-bold mb-2">Canal</label>
                                <select
                                    id="edit-canal"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formCanal ?? ''}
                                    onChange={(e) => setFormCanal(e.target.value as AutoMessageChannel)}
                                >
                                    <option value="">Sélectionner un canal</option>
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="sms">SMS</option>
                                    <option value="email">Email</option>
                                </select>
                            </div>
                            <div className="mb-4">
                                <label htmlFor="edit-position" className="block text-gray-700 text-sm font-bold mb-2">Position</label>
                                <input
                                    type="number"
                                    id="edit-position"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formPosition}
                                    onChange={(e) => setFormPosition(parseInt(e.target.value))}
                                    required
                                />
                            </div>
                            <div className="mb-4 flex items-center">
                                <input
                                    type="checkbox"
                                    id="edit-actif"
                                    className="mr-2 leading-tight"
                                    checked={formActif}
                                    onChange={(e) => setFormActif(e.target.checked)}
                                />
                                <label htmlFor="edit-actif" className="text-gray-700 text-sm font-bold">Actif</label>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={handleCloseEditModal}
                                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
                                    disabled={loading}
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center"
                                    disabled={loading}
                                >
                                    {loading && <Spinner />}
                                    {loading ? 'Saving...' : 'Sauvegarder'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
