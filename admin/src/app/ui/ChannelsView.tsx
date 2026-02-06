// admin/src/app/ui/ChannelsView.tsx
import React from 'react';
import { Channel } from '@/app/lib/definitions';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';

interface ChannelsViewProps {
    channels: Channel[];
}

export default function ChannelsView({ channels }: ChannelsViewProps) {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Gestion des Canaux WHAPI</h2>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <PlusCircle className="w-4 h-4" />
                    Ajouter un canal
                </button>
            </div>

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
