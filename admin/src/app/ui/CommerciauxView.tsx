import React, { useState } from 'react';
import { Search, UserPlus, Eye, Edit, TrendingUp, MessageCircle, Clock, Target } from 'lucide-react';
import { PerformanceCommercial } from '@/app/lib/definitions';
import { updateCommercial } from '@/app/lib/api';
import { logger } from '@/app/lib/logger';
import { useToast } from '@/app/ui/ToastProvider';

interface CommerciauxViewProps {
  commerciaux: PerformanceCommercial[];
  onCommercialUpdate: () => void;
}

export default function CommerciauxView({ 
  commerciaux, 
  onCommercialUpdate 
}: CommerciauxViewProps) {

  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formName, setFormName] = useState('');
  const [currentCommercial, setCurrentCommercial] = useState<PerformanceCommercial | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { addToast } = useToast();

  logger.debug("Commerciaux loaded", { count: commerciaux.length });

  // Fonction pour obtenir la couleur du statut
  const getStatusColor = (isConnected: boolean) => {
    return isConnected ? 'bg-green-500' : 'bg-gray-400';
  };

  // Fonction pour obtenir le badge de performance basÃ© sur le taux de rÃ©ponse
  const getPerformanceBadge = (tauxReponse: number) => {
    if (tauxReponse >= 80) return 'bg-green-100 text-green-800';
    if (tauxReponse >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // Fonction pour obtenir le texte de performance
  const getPerformanceText = (tauxReponse: number) => {
    if (tauxReponse >= 80) return 'Excellent';
    if (tauxReponse >= 60) return 'Moyen';
    return 'Faible';
  };

  // Formater le temps en minutes
  const formatTemps = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes}min`;
  };

  // Formater la date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Jamais';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `Il y a ${diffMins}min`;
    if (diffMins < 1440) return `Il y a ${Math.floor(diffMins / 60)}h`;
    return `Il y a ${Math.floor(diffMins / 1440)}j`;
  };

  const handleDeleteCommercial = async (id: string) => {
    if (!window.confirm('ÃŠtes-vous sÃ»r de vouloir supprimer ce commercial ?')) {
      return;
    }
    setLoading(true);
    try {
      // await deleteCommercial(id);
      onCommercialUpdate();
      addToast({ type: 'success', message: 'Commercial supprime.' });
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : "Ã‰chec de la suppression du commercial.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCommercial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCommercial) {
      addToast({ type: 'error', message: "L'ID du commercial est manquant." });
      return;
    }
    setLoading(true);
    try {
      await updateCommercial(currentCommercial.id.toString(), {
        name: formName, 
        is_active: formIsActive 
      });
      onCommercialUpdate();
      handleCloseEditModal();
      addToast({ type: 'success', message: 'Commercial mis a jour.' });
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : "Ã‰chec de la mise Ã  jour du commercial.",
      });
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

  const handleOpenEditModal = (commercial: PerformanceCommercial) => {
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

  // Filtrer les commerciaux par recherche
  const commerciauxFiltres = commerciaux.filter(commercial => 
    commercial.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    commercial.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    commercial.poste_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Statistiques globales
  const statsGlobales = {
    total: commerciaux.length,
    connectes: commerciaux.filter(c => c.isConnected).length,
    actifs: commerciaux.filter(c => c.nbChatsActifs > 0).length,
    tauxReponseGlobal: commerciaux.length > 0 
      ? Math.round(commerciaux.reduce((sum, c) => sum + c.tauxReponse, 0) / commerciaux.length)
      : 0,
  };

  return (
    <div className="space-y-6">
      {/* Statistiques globales */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">{statsGlobales.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <div>
              <p className="text-sm text-gray-600">En ligne</p>
              <p className="text-2xl font-bold text-gray-900">{statsGlobales.connectes}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Actifs</p>
              <p className="text-2xl font-bold text-gray-900">{statsGlobales.actifs}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Taux rÃ©ponse</p>
              <p className="text-2xl font-bold text-gray-900">{statsGlobales.tauxReponseGlobal}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Barre de recherche et actions */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un commercial..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button 
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Ajouter
          </button>
        </div>
      </div>

      {/* Tableau des commerciaux */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commercial</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Poste</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chats actifs</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Messages</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Taux rÃ©ponse</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Temps moy.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">DerniÃ¨re co.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {commerciauxFiltres.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'Aucun commercial trouvÃ©' : 'Aucun commercial disponible'}
                  </td>
                </tr>
              ) : (
                commerciauxFiltres.map((commercial) => (
                  <tr key={commercial.id} className="hover:bg-gray-50">
                    {/* Commercial */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                            {commercial.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${getStatusColor(commercial.isConnected)} border-2 border-white rounded-full`}></div>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{commercial.name}</p>
                          <p className="text-xs text-gray-500">{commercial.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Statut */}
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        commercial.isConnected 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {commercial.isConnected ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </td>

                    {/* Poste */}
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">{commercial.poste_name}</span>
                    </td>

                    {/* Chats actifs */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">{commercial.nbChatsActifs}</span>
                      </div>
                    </td>

                    {/* Messages */}
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">
                          {commercial.nbMessagesEnvoyes + commercial.nbMessagesRecus}
                        </p>
                        <p className="text-xs text-gray-500">
                          â†‘{commercial.nbMessagesEnvoyes} â†“{commercial.nbMessagesRecus}
                        </p>
                      </div>
                    </td>

                    {/* Taux de rÃ©ponse */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          getPerformanceBadge(commercial.tauxReponse)
                        }`}>
                          {commercial.tauxReponse}%
                        </span>
                        <span className="text-xs text-gray-500">
                          {getPerformanceText(commercial.tauxReponse)}
                        </span>
                      </div>
                    </td>

                    {/* Temps moyen */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">
                          {formatTemps(commercial.tempsReponseMoyen)}
                        </span>
                      </div>
                    </td>

                    {/* DerniÃ¨re connexion */}
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {formatDate(commercial.lastConnectionAt)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button 
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Voir les dÃ©tails"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(commercial)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          disabled={loading}
                          title="Modifier"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal d'Ã©dition - Ã€ complÃ©ter selon vos besoins */}
      {showEditModal && currentCommercial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Modifier le commercial
            </h3>
            <form onSubmit={handleUpdateCommercial}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  disabled={loading}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


