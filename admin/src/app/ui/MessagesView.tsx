import React, { useEffect, useState } from 'react';
import UnderDevelopmentView from './UnderDevelopmentView';
import { WhatsappMessage } from '../lib/definitions';
import { Edit, Eye, Search } from 'lucide-react';
import { getPerformanceBadge } from '../lib/utils';
import { Spinner } from './Spinner';


interface MessagesViewProps {
    messages: WhatsappMessage[];
    onMessageUpdated: () => void; // Callback to refresh data in parent
}
export default function MessagesView({
    messages, onMessageUpdated
}:MessagesViewProps) {
  
   const [loading, setLoading] = useState(false);
    return (<>    
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Rechercher un commercial..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

               <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom du Poste</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Créé le</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {messages.map((messae) => (
                                <tr key={messae.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{messae.chat_id}</td>
                                    <td className="px-6 py-4 text-gray-700">{messae.text}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            messae.status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {messae.direction ? 'Actif' : 'Inactif'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(messae.timestamp).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {messages.length === 0 && !loading && (
                        <p className="text-center text-gray-500 py-4">Aucun poste trouvé.</p>
                    )}
                    {loading && (
                        <div className="flex justify-center py-4">
                            <Spinner />
                        </div>
                    )}
                </div>
            </div>
        </div>
    </> );
}