"use client";

import React, { useState, useEffect } from 'react';
import { Client } from '@/app/lib/definitions';
import { Search, UserPlus, Edit, Trash2, MessageCircle, Save, XCircle } from 'lucide-react';
import { createClient, updateClient, deleteClient } from '@/app/lib/api';
import { Spinner } from './Spinner';

interface ClientsViewProps {
    initialClients: Client[];
    onClientUpdated: () => void; // Callback to refresh data in parent
}

export default function ClientsView({ initialClients, onClientUpdated }: ClientsViewProps) {
    const [clients, setClients] = useState<Client[]>(initialClients);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [currentClient, setCurrentClient] = useState<Client | null>(null);
    const [formName, setFormName] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formChatId, setFormChatId] = useState('');
    const [formIsActive, setFormIsActive] = useState(true);
    const [loading, setLoading] = useState(false);
    const [operationError, setOperationError] = useState<string | null>(null);

    useEffect(() => {
        setClients(initialClients);
    }, [initialClients]);

    console.log("les comntact ", clients);
    

    // Removed: const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;

    const handleOpenAddModal = () => {
        setFormName('');
        setFormPhone('');
        setFormChatId('');
        setFormIsActive(true);
        setOperationError(null);
        setShowAddModal(true);
    };

    const handleCloseAddModal = () => {
        setShowAddModal(false);
        setOperationError(null);
    };

    const handleOpenEditModal = (client: Client) => {
        setCurrentClient(client);
        setFormName(client.name);
        setFormPhone(client.phone);
        setFormChatId(client.chat_id || '');
        setFormIsActive(client.is_active);
        setOperationError(null);
        setShowEditModal(true);
    };

    const handleCloseEditModal = () => {
        setShowEditModal(false);
        setCurrentClient(null);
        setOperationError(null);
    };

    const handleAddClient = async (e: React.FormEvent) => {
        e.preventDefault();
        // Removed: if (!token) { setOperationError("Authentication token is missing."); return; }
        setLoading(true);
        setOperationError(null);
        try {
            await createClient({ name: formName, phone: formPhone, chat_id: formChatId, is_active: formIsActive }); // Removed token parameter
            onClientUpdated();
            handleCloseAddModal();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to add client.");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        // Removed: if (!token || !currentClient) { setOperationError("Authentication token or client ID is missing."); return; }
        if (!currentClient) { // Keep check for currentClient
            setOperationError("Client ID is missing.");
            return;
        }
        setLoading(true);
        setOperationError(null);
        try {
            await updateClient(currentClient.id, { name: formName, phone: formPhone, chat_id: formChatId, is_active: formIsActive }); // Removed token parameter
            onClientUpdated();
            handleCloseEditModal();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to update client.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClient = async (id: string) => {
        // Removed: if (!token || !window.confirm('Are you sure you want to delete this client?')) { return; }
        if (!window.confirm('Are you sure you want to delete this client?')) { // Keep confirmation
            return;
        }
        setLoading(true);
        setOperationError(null);
        try {
            await deleteClient(id); // Removed token parameter
            onClientUpdated();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to delete client.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Gestion des Clients</h2>
                <button
                    onClick={handleOpenAddModal}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    disabled={loading}
                >
                    <UserPlus className="w-4 h-4" />
                    Ajouter un client
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Téléphone</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chat ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">nb Message</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Créé le</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {clients.map((client) => (
                                <tr key={client.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{client.name}</td>
                                    <td className="px-6 py-4 text-gray-700">{client.phone}</td>
                                    <td className="px-6 py-4 text-gray-700">{client.chat_id || 'N/A'}</td>
                                     <td className="px-6 py-4 text-gray-700">{client.messages?.length || 'N/A'}</td>

                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            client.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {client.is_active ? 'Actif' : 'Inactif'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(client.createdAt).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleOpenEditModal(client)}
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                disabled={loading}
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClient(client.id)}
                                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                disabled={loading}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                disabled={loading}
                                            >
                                                <MessageCircle className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {clients.length === 0 && !loading && (
                        <p className="text-center text-gray-500 py-4">Aucun client trouvé.</p>
                    )}
                    {loading && (
                        <div className="flex justify-center py-4">
                            <Spinner />
                        </div>
                    )}
                </div>
            </div>

            {/* Add Client Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
                    <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-semibold mb-4">Ajouter un nouveau client</h3>
                        {operationError && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                                {operationError}
                            </div>
                        )}
                        <form onSubmit={handleAddClient}>
                            <div className="mb-4">
                                <label htmlFor="name" className="block text-gray-700 text-sm font-bold mb-2">Nom</label>
                                <input
                                    type="text"
                                    id="name"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="phone" className="block text-gray-700 text-sm font-bold mb-2">Téléphone</label>
                                <input
                                    type="text"
                                    id="phone"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formPhone}
                                    onChange={(e) => setFormPhone(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="chat_id" className="block text-gray-700 text-sm font-bold mb-2">Chat ID (Optionnel)</label>
                                <input
                                    type="text"
                                    id="chat_id"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formChatId}
                                    onChange={(e) => setFormChatId(e.target.value)}
                                />
                            </div>
                            <div className="mb-4 flex items-center">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    className="mr-2 leading-tight"
                                    checked={formIsActive}
                                    onChange={(e) => setFormIsActive(e.target.checked)}
                                />
                                <label htmlFor="is_active" className="text-gray-700 text-sm font-bold">Actif</label>
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

            {/* Edit Client Modal */}
            {showEditModal && currentClient && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
                    <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-semibold mb-4">Modifier le client</h3>
                        {operationError && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                                {operationError}
                            </div>
                        )}
                        <form onSubmit={handleUpdateClient}>
                            <div className="mb-4">
                                <label htmlFor="edit-name" className="block text-gray-700 text-sm font-bold mb-2">Nom</label>
                                <input
                                    type="text"
                                    id="edit-name"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="edit-phone" className="block text-gray-700 text-sm font-bold mb-2">Téléphone</label>
                                <input
                                    type="text"
                                    id="edit-phone"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formPhone}
                                    onChange={(e) => setFormPhone(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="edit-chat_id" className="block text-gray-700 text-sm font-bold mb-2">Chat ID (Optionnel)</label>
                                <input
                                    type="text"
                                    id="edit-chat_id"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formChatId}
                                    onChange={(e) => setFormChatId(e.target.value)}
                                />
                            </div>
                            <div className="mb-4 flex items-center">
                                <input
                                    type="checkbox"
                                    id="edit-is_active"
                                    className="mr-2 leading-tight"
                                    checked={formIsActive}
                                    onChange={(e) => setFormIsActive(e.target.checked)}
                                />
                                <label htmlFor="edit-is_active" className="text-gray-700 text-sm font-bold">Actif</label>
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