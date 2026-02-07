"use client";

import React, { useState, useEffect } from 'react';
import { Poste } from '@/app/lib/definitions';
import { PlusCircle, Edit, Trash2, Save, XCircle } from 'lucide-react';
import { createPoste, updatePoste, deletePoste, getPostes } from '@/app/lib/api'; // Import CRUD API functions
import { Spinner } from './Spinner'; // Assuming Spinner is available

interface PostesViewProps {
    initialPostes: Poste[];
    onPosteUpdated: () => void; // Callback to refresh data in parent
}

export default function PostesView({ initialPostes, onPosteUpdated }: PostesViewProps) {
    const [postes, setPostes] = useState<Poste[]>(initialPostes);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [currentPoste, setCurrentPoste] = useState<Poste | null>(null);
    const [formName, setFormName] = useState('');
    const [formCode, setFormCode] = useState('');
    const [formIsActive, setFormIsActive] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [operationError, setOperationError] = useState<string | null>(null);

    useEffect(() => {
        setPostes(initialPostes);
    }, [initialPostes]);

    // Removed: const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;
console.log("le poste retourne:", postes);

    const handleOpenAddModal = () => {
        setFormName('');
        setFormCode('');
        setFormIsActive(true);
        setShowAddModal(true);
    };

    const handleCloseAddModal = () => {
        setShowAddModal(false);
        setOperationError(null);
    };

    const handleOpenEditModal = (poste: Poste) => {
        setCurrentPoste(poste);
        setFormName(poste.name);
        setFormCode(poste.code);
        setFormIsActive(poste.is_active);
        setShowEditModal(true);
    };

    const handleCloseEditModal = () => {
        setShowEditModal(false);
        setCurrentPoste(null);
        setOperationError(null);
    };

    const handleAddPoste = async (e: React.FormEvent) => {
        e.preventDefault();
        // Removed: if (!token) { setOperationError("Authentication token is missing."); return; }
        setLoading(true);
        setOperationError(null);
        try {
            await createPoste({
                name: formName, code: formCode, is_active: formIsActive,
                chats: [],
                messages: [],
                commercial: []
            }); // Removed token parameter
            onPosteUpdated(); // Trigger parent to re-fetch all postes
            handleCloseAddModal();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to add poste.");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePoste = async (e: React.FormEvent) => {
        e.preventDefault();
        // Removed: if (!token || !currentPoste) { setOperationError("Authentication token or poste ID is missing."); return; }
        if (!currentPoste) { // Keep check for currentPoste
            setOperationError("Poste ID is missing.");
            return;
        }
        setLoading(true);
        setOperationError(null);
        try {
            await updatePoste(currentPoste.id, { name: formName, code: formCode, is_active: formIsActive }); // Removed token parameter
            onPosteUpdated(); // Trigger parent to re-fetch all postes
            handleCloseEditModal();
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to update poste.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePoste = async (id: string) => {
        // Removed: if (!token || !window.confirm('Are you sure you want to delete this poste?')) { return; }
        if (!window.confirm('Are you sure you want to delete this poste?')) { // Keep confirmation
            return;
        }
        setLoading(true);
        setOperationError(null);
        try {
            await deletePoste(id); // Removed token parameter
            onPosteUpdated(); // Trigger parent to re-fetch all postes
        } catch (err) {
            setOperationError(err instanceof Error ? err.message : "Failed to delete poste.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Gestion des Postes</h2>
                <button
                    onClick={handleOpenAddModal}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    disabled={loading}
                >
                    <PlusCircle className="w-4 h-4" />
                    Ajouter un poste
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom du Poste</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nb chats</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nb sms</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nb Agent</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Créé le</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {postes.map((poste) => (
                                <tr key={poste.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{poste.name}</td>
                                    <td className="px-6 py-4 text-gray-700">{poste.chats?.length}</td>
                                     <td className="px-6 py-4 text-gray-700">{poste.messages?.length}</td>
                                      <td className="px-6 py-4 text-gray-700">{poste.commercial?.length}</td>
                                    <td className="px-6 py-4 text-gray-700">{poste.code}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            poste.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {poste.is_active ? 'Actif' : 'Inactif'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(poste.created_at).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleOpenEditModal(poste)}
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                disabled={loading}
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeletePoste(poste.id)}
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
                    {postes.length === 0 && !loading && (
                        <p className="text-center text-gray-500 py-4">Aucun poste trouvé.</p>
                    )}
                    {loading && (
                        <div className="flex justify-center py-4">
                            <Spinner />
                        </div>
                    )}
                </div>
            </div>

            {/* Add Poste Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
                    <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-semibold mb-4">Ajouter un nouveau poste</h3>
                        {operationError && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                                {operationError}
                            </div>
                        )}
                        <form onSubmit={handleAddPoste}>
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
                                <label htmlFor="code" className="block text-gray-700 text-sm font-bold mb-2">Code</label>
                                <input
                                    type="text"
                                    id="code"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formCode}
                                    onChange={(e) => setFormCode(e.target.value)}
                                    required
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

            {/* Edit Poste Modal */}
            {showEditModal && currentPoste && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
                    <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-semibold mb-4">Modifier le poste</h3>
                        {operationError && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                                {operationError}
                            </div>
                        )}
                        <form onSubmit={handleUpdatePoste}>
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
                                <label htmlFor="edit-code" className="block text-gray-700 text-sm font-bold mb-2">Code</label>
                                <input
                                    type="text"
                                    id="edit-code"
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    value={formCode}
                                    onChange={(e) => setFormCode(e.target.value)}
                                    required
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