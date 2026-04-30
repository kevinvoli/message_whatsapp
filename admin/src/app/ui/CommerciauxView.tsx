import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, UserPlus, Eye, Edit, Trash2, TrendingUp, MessageCircle, Clock, Target, RefreshCw, ArrowLeft, Mail, MapPin, MessageSquare, LogOut } from 'lucide-react';
import { PerformanceCommercial, Poste } from '@/app/lib/definitions';
import { createCommercial, deleteCommercial, getPerformanceCommerciaux, getPostes, updateCommercial, runCronNow } from '@/app/lib/api';
import { logger } from '@/app/lib/logger';
import { useToast } from '@/app/ui/ToastProvider';
import { formatRelativeDate } from '@/app/lib/dateUtils';
import { useCrudResource } from '../hooks/useCrudResource';
import { EntityFormModal } from './crud/EntityFormModal';

interface CommerciauxViewProps {
  onRefresh?: () => void;
  selectedPeriod?: string;
  onViewConversations?: (commercialId: string, posteId: string) => void;
}

export default function CommerciauxView({ onRefresh, selectedPeriod = 'today', onViewConversations }: CommerciauxViewProps) {
  const [commerciaux, setCommerciaux] = useState<PerformanceCommercial[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const {
    loading: crudLoading,
    clearStatus,
    create,
    update,
    remove,
  } = useCrudResource<
    PerformanceCommercial,
    { name: string; email: string; password: string; poste_id?: string | null },
    { name?: string; email?: string; password?: string; poste_id?: string | null; is_active?: boolean }
  >({
    initialItems: [],
    onRefresh: () => refreshRef.current(),
    createItem: createCommercial,
    updateItem: updateCommercial,
    deleteItem: deleteCommercial,
    getId: (item) => item.id,
  });

  const [disconnecting, setDisconnecting] = useState(false);
  const loading = crudLoading || dataLoading;
  const { addToast } = useToast();

  const handleDisconnectAll = async () => {
    const connected = commerciaux.filter(c => c.isConnected).length;
    if (connected === 0) {
      addToast({ type: 'info', message: 'Aucun commercial connecté.' });
      return;
    }
    if (!window.confirm(`Déconnecter les ${connected} commercial(aux) actuellement en ligne ?`)) return;
    setDisconnecting(true);
    try {
      await runCronNow('disconnect-all');
      addToast({ type: 'success', message: `${connected} commercial(aux) déconnecté(s).` });
      await fetchData();
    } catch {
      addToast({ type: 'error', message: 'Erreur lors de la déconnexion.' });
    } finally {
      setDisconnecting(false);
    }
  };

  const fetchData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [commerciauxData, postesData] = await Promise.all([
        getPerformanceCommerciaux(selectedPeriod),
        getPostes(),
      ]);
      setCommerciaux(commerciauxData);
      setPostes(postesData);
    } catch (err) {
      logger.error('Erreur chargement commerciaux', { error: err instanceof Error ? err.message : String(err) });
      addToast({ type: 'error', message: 'Impossible de charger les commerciaux.' });
    } finally {
      setDataLoading(false);
    }
  }, [addToast, selectedPeriod]);

  refreshRef.current = fetchData;

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formName, setFormName] = useState('');
  const [formPosteId, setFormPosteId] = useState<string | null>(null);
  const [formPassword, setFormPassword] = useState<string>('');
  const [formEmail, setFormEmail] = useState('');
  const [formAllowOutsideHours, setFormAllowOutsideHours] = useState(false);
  const [currentCommercial, setCurrentCommercial] = useState<PerformanceCommercial | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<PerformanceCommercial | null>(null);
  logger.debug("Commerciaux loaded", { count: commerciaux.length });

  // Fonction pour obtenir la couleur du statut
  const getStatusColor = (isConnected: boolean) => {
    return isConnected ? 'bg-green-500' : 'bg-gray-400';
  };

  // Fonction pour obtenir le badge de performance basé sur le taux de réponse
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
    return formatRelativeDate(dateString);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await create(
      {
        name: formName,
        email: formEmail,
        password: formPassword,
        poste_id: formPosteId,
      },
      'Commercial ajouté.',
    );
    if (result.ok) {
      closeAddModal();
    }
  };

  const handleDeleteCommercial = async (id: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce commercial ?')) {
      return;
    }
    await remove(id, 'Commercial supprimé.');
  };

  const handleUpdateCommercial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCommercial) {
      addToast({ type: 'error', message: "L'ID du commercial est manquant." });
      return;
    }
    const payload: { name?: string; email?: string; password?: string; poste_id?: string | null; allowOutsideHours?: boolean } = {
      name: formName,
      email: formEmail,
      poste_id: formPosteId,
      allowOutsideHours: formAllowOutsideHours,
    };
    if (formPassword) {
      payload.password = formPassword;
    }
    const result = await update(
      currentCommercial.id.toString(),
      payload,
      'Commercial mis à jour.',
    );
    if (result.ok) {
      handleCloseEditModal();
    }
  };

  const handleOpenAddModal = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormPosteId(null);
    setFormIsActive(true);
    clearStatus();
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    clearStatus();
  };

  const handleOpenEditModal = (commercial: PerformanceCommercial) => {
    setCurrentCommercial(commercial);
    setFormName(commercial.name);
    setFormEmail(commercial.email);
    setFormPassword('');
    setFormPosteId(commercial?.poste_id || null);
    setFormIsActive(true);
    setFormAllowOutsideHours(commercial.allowOutsideHours ?? false);
    setShowEditModal(true);
    clearStatus();
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setCurrentCommercial(null);
    clearStatus()
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
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void fetchData()}
          title="Rafraîchir"
          aria-label="Rafraîchir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
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
              <p className="text-sm text-gray-600">Taux réponse</p>
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
            onClick={() => void handleDisconnectAll()}
            disabled={disconnecting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            title="Déconnecter tous les commerciaux en ligne"
          >
            <LogOut className="w-4 h-4" />
            {disconnecting ? 'Déconnexion...' : 'Déconnecter tous'}
          </button>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Taux réponse</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Temps moy.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dernière co.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {dataLoading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <svg className="animate-spin w-8 h-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-sm">Chargement des commerciaux...</span>
                    </div>
                  </td>
                </tr>
              ) : commerciauxFiltres.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'Aucun commercial trouvé' : 'Aucun commercial disponible'}
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
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${commercial.isConnected
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                          }`}>
                          {commercial.isConnected ? 'En ligne' : 'Hors ligne'}
                        </span>
                        {commercial.allowOutsideHours && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            Hors horaires
                          </span>
                        )}
                      </div>
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
                        <p className="text-xs">
                          <span className="text-blue-600 font-semibold">
                            ↑{commercial.nbMessagesEnvoyes}
                          </span>
                          <span className="mx-1 text-slate-400">/</span>
                          <span className="text-emerald-600 font-semibold">
                            ↓{commercial.nbMessagesRecus}
                          </span>
                        </p>
                      </div>
                    </td>

                    {/* Taux de réponse */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPerformanceBadge(commercial.tauxReponse)
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

                    {/* Dernière connexion */}
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {formatDate(commercial.lastConnectionAt)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedDetail(commercial)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Voir les details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {onViewConversations && (
                          <button
                            onClick={() => onViewConversations(commercial.id, commercial.poste_id ?? '')}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Voir les conversations"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditModal(commercial)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          disabled={loading}
                          title="Modifier"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void handleDeleteCommercial(commercial.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          disabled={loading}
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Detail commercial */}
      {selectedDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedDetail(null)}
                className="p-1 text-gray-500 hover:bg-gray-100 rounded"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                    {selectedDetail.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 ${getStatusColor(selectedDetail.isConnected)} border-2 border-white rounded-full`}></div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedDetail.name}</h3>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {selectedDetail.email}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedDetail.poste_name || 'Non assigne'}</span>
                  </div>
                </div>
              </div>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${selectedDetail.isConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
              {selectedDetail.isConnected ? 'En ligne' : 'Hors ligne'}
            </span>
          </div>

          <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <MessageCircle className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-blue-700 font-medium">Messages envoyes</span>
              </div>
              <p className="text-2xl font-bold text-blue-900">{selectedDetail.nbMessagesEnvoyes}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <MessageCircle className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-700 font-medium">Messages recus</span>
              </div>
              <p className="text-2xl font-bold text-green-900">{selectedDetail.nbMessagesRecus}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-purple-600" />
                <span className="text-xs text-purple-700 font-medium">Chats actifs</span>
              </div>
              <p className="text-2xl font-bold text-purple-900">{selectedDetail.nbChatsActifs}</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-orange-600" />
                <span className="text-xs text-orange-700 font-medium">Taux reponse</span>
              </div>
              <p className="text-2xl font-bold text-orange-900">{selectedDetail.tauxReponse}%</p>
            </div>
          </div>

          <div className="px-6 pb-6 grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Performance</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Temps reponse moyen</span>
                  <span className="font-semibold text-gray-900">{formatTemps(selectedDetail.tempsReponseMoyen)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Niveau performance</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPerformanceBadge(selectedDetail.tauxReponse)}`}>
                    {getPerformanceText(selectedDetail.tauxReponse)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Total messages</span>
                  <span className="font-semibold text-gray-900">{selectedDetail.nbMessagesEnvoyes + selectedDetail.nbMessagesRecus}</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Informations</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Derniere connexion</span>
                  <span className="font-semibold text-gray-900">{formatDate(selectedDetail.lastConnectionAt)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Poste</span>
                  <span className="font-semibold text-gray-900">{selectedDetail.poste_name || '-'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">ID</span>
                  <span className="font-mono text-xs text-gray-500">{selectedDetail.id}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'edition */}
      <EntityFormModal
        isOpen={showAddModal}
        title="Ajouter un commercial"
        onClose={closeAddModal}
        onSubmit={handleAdd}
        loading={loading}
        submitLabel="Ajouter"
        loadingLabel="Adding..."
      >
        <div className="mb-4">
          <label htmlFor="name" className="mb-2 block text-sm font-bold text-gray-700">
            Nom
          </label>
          <input
            type="text"
            id="name"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="code" className="mb-2 block text-sm font-bold text-gray-700">
            email
          </label>
          <input
            type="text"
            id="email"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="password" className="mb-2 block text-sm font-bold text-gray-700">
            Mot de passe
          </label>
          <input
            type="password"
            id="password"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="postId" className="mb-2 block text-sm font-bold text-gray-700">
            Poste
          </label>
          <select
            id="postId"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formPosteId ?? ''}
            onChange={(e) => setFormPosteId(e.target.value || null)}
          >
            <option value="">— Aucun poste —</option>
            {postes.map((poste) => (
              <option key={poste.id} value={poste.id}>
                {poste.name}
              </option>
            ))}
          </select>
        </div>
      </EntityFormModal>

      <EntityFormModal
        isOpen={showEditModal && !!currentCommercial}
        title="Modifier le commercial"
        onClose={handleCloseEditModal}
        onSubmit={handleUpdateCommercial}
        loading={loading}
        submitLabel="Sauvegarder"
        loadingLabel="Saving..."
      >
        <div className="mb-4">
          <label htmlFor="edit-name" className="mb-2 block text-sm font-bold text-gray-700">
            Nom
          </label>
          <input
            type="text"
            id="edit-name"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="edit-email" className="mb-2 block text-sm font-bold text-gray-700">
            Email
          </label>
          <input
            type="text"
            id="edit-email"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="edit-password" className="mb-2 block text-sm font-bold text-gray-700">
            Nouveau mot de passe <span className="font-normal text-gray-500">(laisser vide pour ne pas modifier)</span>
          </label>
          <input
            type="password"
            id="edit-password"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="edit-postId" className="mb-2 block text-sm font-bold text-gray-700">
            Poste
          </label>
          <select
            id="edit-postId"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formPosteId ?? ''}
            onChange={(e) => setFormPosteId(e.target.value || null)}
          >
            <option value="">— Aucun poste —</option>
            {postes.map((poste) => (
              <option key={poste.id} value={poste.id}>
                {poste.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-4 flex items-center justify-between rounded border border-purple-200 bg-purple-50 px-3 py-3">
          <div>
            <p className="text-sm font-bold text-gray-700">Connexion hors horaires</p>
            <p className="text-xs text-gray-500">Autorise la connexion entre 21h et 5h</p>
          </div>
          <button
            type="button"
            onClick={() => setFormAllowOutsideHours((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              formAllowOutsideHours ? 'bg-purple-600' : 'bg-gray-300'
            }`}
            aria-pressed={formAllowOutsideHours}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                formAllowOutsideHours ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </EntityFormModal>
    </div>
  );
}


