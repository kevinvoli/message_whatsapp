// admin/src/app/ui/MessageAutoView.tsx
import React from 'react';
import { MessageAuto } from '@/app/lib/definitions';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';

interface MessageAutoViewProps {
    messagesAuto: MessageAuto[];
}

export default function MessageAutoView({ messagesAuto }: MessageAutoViewProps) {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Gestion des Messages Automatiques</h2>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <PlusCircle className="w-4 h-4" />
                    Ajouter un message auto
                </button>
            </div>

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
                                            <button className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button className="p-1 text-red-600 hover:bg-red-50 rounded">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
