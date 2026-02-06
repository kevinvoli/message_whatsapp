"use client";

import React, { useState, useEffect } from 'react';
import { Channel } from '@/app/lib/definitions';
import { PlusCircle, Edit, Trash2, Save, XCircle } from 'lucide-react';
import { createChannel, updateChannel, deleteChannel, getChannels } from '@/app/lib/api';
import { Spinner } from './Spinner';

interface ChannelsViewProps {
    initialChannels: Channel[];
    onChannelUpdated: () => void; // Callback to refresh data in parent
}

export default function ChannelsView({ initialChannels, onChannelUpdated }: ChannelsViewProps) {
    const [channels, setChannels] = useState<Channel[]>(initialChannels);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
    const [formToken, setFormToken] = useState('');
    const [formIsBusiness, setFormIsBusiness] = useState(false); // For editing, if applicable
    const [loading, setLoading] = useState(false);
    const [operationError, setOperationError] = useState<string | null>(null);

    useEffect(() => {
        setChannels(initialChannels);
    }, [initialChannels]);

    // Removed: const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;

    const handleOpenAddModal = () => {
        setFormToken('');
        setOperationError(null);
        setShowAddModal(true);
    };

    const handleCloseAddModal = () => {
        setShowAddModal(false);
        setOperationError(null);
    };

    const handleOpenEditModal = (channel: Channel) => {
        setCurrentChannel(channel);
        setFormToken(channel.token); // Assuming token can be edited, or just displayed
        setFormIsBusiness(channel.is_business); // Example editable field
        setOperationError(null);
        setShowEditModal(true);
    };

    const handleCloseEditModal = () => {
        setShowEditModal(false);
        setCurrentChannel(null);
        setOperationError(null);
    };

    const handleAddChannel = async (e: React.FormEvent) => {
        e.preventDefault();
        // Removed: if (!token) { setOperationError("Authentication token is missing."); return; }
        setLoading(true);
        setOperationError(null);
        try {
            // Backend's createChannel only takes 'token'
            await createChannel({ token: formToken }); // Removed token parameter
            onChannelUpdated();
            handleCloseAddModal();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to add channel.");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateChannel = async (e: React.FormEvent) => {
        e.preventDefault();
        // Removed: if (!token || !currentChannel) { setOperationError("Authentication token or channel ID is missing."); return; }
        if (!currentChannel) { // Keep check for currentChannel
            setOperationError("Channel ID is missing.");
            return;
        }
        setLoading(true);
        setOperationError(null);
        try {
            // Update only editable fields like is_business or token if needed
            await updateChannel(currentChannel.id, { token: formToken, is_business: formIsBusiness }); // Removed token parameter
            onChannelUpdated();
            handleCloseEditModal();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to update channel.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteChannel = async (id: string) => {
        // Removed: if (!token || !window.confirm('Are you sure you want to delete this channel?')) { return; }
        if (!window.confirm('Are you sure you want to delete this channel?')) { // Keep confirmation
            return;
        }
        setLoading(true);
        setOperationError(null);
        try {
            await deleteChannel(id); // Removed token parameter
            onChannelUpdated();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to delete channel.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Gestion des Canaux WHAPI</h2>
                <button
                    onClick={handleOpenAddModal}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    disabled={loading}
                >
                    <PlusCircle className="w-4 h-4" />
                    Ajouter un canal
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Token (Partiel)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version API</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Créé le</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {channels.map((channel) => (
                                <tr key={channel.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{channel.channel_id}</td>
                                    <td className="px-6 py-4 text-gray-700">{channel.token.substring(0, 10)}...</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            channel.is_business ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {channel.is_business ? 'Oui' : 'Non'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-700">{channel.api_version}</td>
                                    <td className="px-6 py-4 text-gray-700">{channel.ip}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(channel.createdAt).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleOpenEditModal(channel)}
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                disabled={loading}
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteChannel(channel.id)}
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
                    {channels.length === 0 && !loading && (
                        <p className="text-center text-gray-500 py-4">Aucun canal trouvé.</p>
                    )}
                    {loading && (
                        <div className="flex justify-center py-4">
                            <Spinner />
                        </div>
                    )}
                </div>
            </div>

            {/* Add Channel Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
                    <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-semibold mb-4">Ajouter un nouveau canal</h3>
                        {operationError && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                                {operationError}
                            </div>
                        )}
                        <form onSubmit={handleAddChannel}>
                            <div className="mb-4">
                                <label htmlFor="token" className="block text-gray-700 text-sm font-bold mb-2">Token</label>
                                <input
                                    type="text"
                                    id="token"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formToken}
                                    onChange={(e) => setFormToken(e.target.value)}
                                    required
                                />
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

            {/* Edit Channel Modal */}
            {showEditModal && currentChannel && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
                    <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-semibold mb-4">Modifier le canal</h3>
                        {operationError && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                                {operationError}
                            </div>
                        )}
                        <form onSubmit={handleUpdateChannel}>
                            <div className="mb-4">
                                <label htmlFor="edit-token" className="block text-gray-700 text-sm font-bold mb-2">Token</label>
                                <input
                                    type="text"
                                    id="edit-token"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formToken}
                                    onChange={(e) => setFormToken(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="mb-4 flex items-center">
                                <input
                                    type="checkbox"
                                    id="edit-is_business"
                                    className="mr-2 leading-tight"
                                    checked={formIsBusiness}
                                    onChange={(e) => setFormIsBusiness(e.target.checked)}
                                />
                                <label htmlFor="edit-is_business" className="text-gray-700 text-sm font-bold">Est Business</label>
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