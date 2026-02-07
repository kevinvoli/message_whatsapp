import React, { useState } from 'react';
import { Search, UserPlus, Eye, Edit } from 'lucide-react';
import { Commercial } from '@/app/lib/definitions';
import { updatCommercial } from '@/app/lib/api';

interface CommerciauxViewProps {
  commerciaux: Commercial[];
  getStatusColor: (status: 'online' | 'away' | 'offline') => string;
  getPerformanceBadge: (performance: 'excellent' | 'moyen' | 'faible') => string;
  onCommercialUpdate: () => void;

}

export default function CommerciauxView({ commerciaux, getStatusColor, getPerformanceBadge, onCommercialUpdate }: CommerciauxViewProps) {

  const [loading, setLoading] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
      const [currentCommercial, setCurrentCommercial] = useState<Commercial | null>(null);
  
  console.log("le commercial==", commerciaux);
  

  const handleDeletePoste = async (id: string) => {
    // Removed: if (!token || !window.confirm('Are you sure you want to delete this poste?')) { return; }
    if (!window.confirm('Are you sure you want to delete this poste?')) { // Keep confirmation
      return;
    }
    setLoading(true);
    setOperationError(null);
    try {
      onCommercialUpdate(); // Trigger parent to re-fetch all postes
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : "Failed to delete poste.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePoste = async (e: React.FormEvent) => {
    e.preventDefault();
    // Removed: if (!token || !currentPoste) { setOperationError("Authentication token or poste ID is missing."); return; }
    if (!currentCommercial) { // Keep check for currentPoste
      setOperationError("Poste ID is missing.");
      return;
    }
    setLoading(true);
    setOperationError(null);
    try {
      await updatCommercial(currentCommercial.id.toString(), { name: formName, is_active: formIsActive }); // Removed token parameter
      onCommercialUpdate(); // Trigger parent to re-fetch all postes
      handleCloseEditModal();
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : "Failed to update poste.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setFormName('');
    setFormIsActive(true);
    setShowAddModal(true);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setOperationError(null);
  };

  const handleOpenEditModal = (commercial: Commercial) => {
    setCurrentCommercial(commercial);
    setFormName(commercial.name);
    setFormIsActive(true);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setCurrentCommercial(null);
    setOperationError(null);
  };

  return (
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
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Ajouter
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commercial</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Messages</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conv.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CA</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Performance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">last connect</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {commerciaux.map((commercial) => (
                <tr key={commercial.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold relative`}>
                        {commercial.avatar}
                        <div className={`absolute bottom-0 right-0 w-3 h-3 ${getStatusColor(commercial.status)} border-2 border-white rounded-full`}></div>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{commercial.name}</p>
                        <p className="text-xs text-gray-500">{commercial.region}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${commercial.status === 'online' ? 'bg-green-100 text-green-800' :
                      commercial.status === 'away' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                      {commercial.status === 'online' ? 'En ligne' : commercial.status === 'away' ? 'Absent' : 'Hors ligne'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{commercial?.messages?.length}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <p className="font-medium text-gray-900">{2}/{commercial.poste.chats?.length}</p>
                      {/* <p className="text-gray-500">{Math.round((commercial.objectifJour / commercial.objectifJour) * 100)}%</p> */}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{(commercial.ca / 1000).toFixed(0)}K</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPerformanceBadge(commercial.performance)}`}>
                      {commercial.performance.charAt(0).toUpperCase() + commercial.performance.slice(1)}
                    </span>
                  </td>
                   <td className="px-6 py-4 text-gray-900">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-900}`}>
                      {commercial.dernierLogin}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(commercial)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        disabled={loading}
                      >
                        <Edit className="w-4 h-4" />
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
