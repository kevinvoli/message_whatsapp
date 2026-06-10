import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, UserPlus, Eye, Edit, Trash2, TrendingUp, MessageCircle, Clock, Target, RefreshCw, Mail, MapPin, MessageSquare, LogOut, BarChart3, CheckCheck, Activity, Wifi, WifiOff, List, UserCircle, Inbox, Reply, CheckCircle, Timer } from 'lucide-react';

import { PerformanceCommercial, Poste, CommercialStatsDto, ChatLuSansReponse } from '@/app/lib/definitions';
import { createCommercial, deleteCommercial, getPerformanceCommerciaux, getPostes, updateCommercial, runCronNow, getCommercialStats, getChatsLusSansReponse } from '@/app/lib/api';
import { logger } from '@/app/lib/logger';
import { useToast } from '@/app/ui/ToastProvider';
import { formatRelativeDate } from '@/app/lib/dateUtils';
import { useCrudResource } from '../hooks/useCrudResource';
import { EntityFormModal } from './crud/EntityFormModal';

type CommerciauxTabKey = 'liste' | 'detail' | 'statistiques' | 'lus-sans-reponse';

interface CommerciauxTab {
  key: CommerciauxTabKey;
  label: string;
  icon: React.ElementType;
}

const COMMERCIAUX_TABS: CommerciauxTab[] = [
  { key: 'liste', label: 'Liste', icon: List },
  { key: 'detail', label: 'Détail', icon: UserCircle },
  { key: 'statistiques', label: 'Statistiques', icon: BarChart3 },
  { key: 'lus-sans-reponse', label: 'Lus sans réponse', icon: MessageCircle },
];

interface CommerciauxViewProps {
  onRefresh?: () => void;
  selectedPeriod?: string;
  dateFrom?: string;
  dateTo?: string;
  onViewConversations?: (commercialId: string, posteId: string) => void;
}

function ModeToggle({
  value, onChange,
}: { value: 'messages' | 'conversations'; onChange: (v: 'messages' | 'conversations') => void }) {
  return (
    <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-100 p-0.5 gap-0.5 mb-4">
      {(['messages', 'conversations'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
            value === m
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {m === 'messages' ? 'Messages' : 'Conversations'}
        </button>
      ))}
    </div>
  );
}

function ConvRateBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-orange-400' : 'bg-red-400';
  const textColor = value >= 80 ? 'text-green-600' : value >= 60 ? 'text-orange-500' : 'text-red-500';
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-lg font-bold ${textColor}`}>{value.toFixed(1)}%</span>
      </div>
      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function CommerciauxView({ onRefresh, selectedPeriod = 'today', dateFrom, dateTo, onViewConversations }: CommerciauxViewProps) {
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

  const [activeTab, setActiveTab] = useState<CommerciauxTabKey>('liste');
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
        getPerformanceCommerciaux(selectedPeriod, dateFrom, dateTo),
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
  }, [addToast, selectedPeriod, dateFrom, dateTo]);

  refreshRef.current = fetchData;

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);

  // Stats temps réel par commercial
  const [statsMap, setStatsMap] = useState<Record<string, CommercialStatsDto>>({});
  const [statsLoading, setStatsLoading] = useState<Record<string, boolean>>({});
  const [statsPanel, setStatsPanel] = useState<PerformanceCommercial | null>(null);
  const [statsMode, setStatsMode] = useState<'messages' | 'conversations'>('messages');
  const [chatsSansReponse, setChatsSansReponse] = useState<ChatLuSansReponse[]>([]);
  const [chatsSansReponseLoading, setChatsSansReponseLoading] = useState(false);
  const [chatsSansReponseCommercial, setChatsSansReponseCommercial] = useState<PerformanceCommercial | null>(null);

  const handleOpenStatsPanel = useCallback(async (commercial: PerformanceCommercial) => {
    setStatsPanel(commercial);
    setActiveTab('statistiques');
    setStatsLoading((prev) => ({ ...prev, [commercial.id]: true }));
    try {
      const data = await getCommercialStats(commercial.id, selectedPeriod, dateFrom, dateTo);
      setStatsMap((prev) => ({ ...prev, [commercial.id]: data }));
    } catch (err) {
      logger.error('Erreur chargement stats commercial', { id: commercial.id, error: err instanceof Error ? err.message : String(err) });
      addToast({ type: 'error', message: 'Impossible de charger les statistiques.' });
    } finally {
      setStatsLoading((prev) => ({ ...prev, [commercial.id]: false }));
    }
  }, [selectedPeriod, dateFrom, dateTo, addToast]);

  const handleOpenChatsLusSansReponse = useCallback(async (commercial: PerformanceCommercial) => {
    setChatsSansReponseCommercial(commercial);
    setActiveTab('lus-sans-reponse');
    setChatsSansReponseLoading(true);
    try {
      const data = await getChatsLusSansReponse(commercial.id, selectedPeriod, dateFrom, dateTo);
      setChatsSansReponse(data);
    } catch {
      addToast({ type: 'error', message: 'Impossible de charger les conversations.' });
    } finally {
      setChatsSansReponseLoading(false);
    }
  }, [selectedPeriod, dateFrom, dateTo, addToast]);

  const handleRefreshStats = useCallback(async (commercialId: string) => {
    setStatsLoading((prev) => ({ ...prev, [commercialId]: true }));
    try {
      const data = await getCommercialStats(commercialId, selectedPeriod, dateFrom, dateTo);
      setStatsMap((prev) => ({ ...prev, [commercialId]: data }));
    } catch (err) {
      logger.error('Erreur rafraichissement stats', { id: commercialId, error: err instanceof Error ? err.message : String(err) });
      addToast({ type: 'error', message: 'Impossible de rafraichir les statistiques.' });
    } finally {
      setStatsLoading((prev) => ({ ...prev, [commercialId]: false }));
    }
  }, [selectedPeriod, dateFrom, dateTo, addToast]);

  // Recharger les stats du commercial sélectionné quand la période du dashboard change
  useEffect(() => {
    if (!statsPanel) return;
    void handleRefreshStats(statsPanel.id);
  }, [selectedPeriod, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps
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

      {/* ─── Onglets ──────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-xl bg-gray-100 p-1">
          {COMMERCIAUX_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Contenu onglet Liste ──────────────────────────────────────── */}
      {activeTab === 'liste' && (
        <>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lu sans rép.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dernière co.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Heures co.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {dataLoading ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-12 text-center">
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
                      <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
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

                        {/* Lu sans réponse */}
                        <td className="px-6 py-4">
                          {commercial.nbMessagesLusSansReponse > 0 ? (
                            <button
                              type="button"
                              onClick={() => void handleOpenChatsLusSansReponse(commercial)}
                              className="text-sm font-semibold text-orange-600 hover:underline cursor-pointer"
                              title="Voir les conversations lues sans réponse"
                            >
                              {commercial.nbMessagesLusSansReponse}
                            </button>
                          ) : (
                            <span className="text-sm font-semibold text-gray-400">0</span>
                          )}
                        </td>

                        {/* Dernière connexion */}
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {formatDate(commercial.lastConnectionAt)}
                          </span>
                        </td>

                        {/* Heures de connexion */}
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">
                            {commercial.totalConnectionMinutes != null
                              ? formatTemps(commercial.totalConnectionMinutes * 60)
                              : '-'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setSelectedDetail(commercial); setActiveTab('detail'); }}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Voir les details"
                              aria-label="Voir les details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => void handleOpenStatsPanel(commercial)}
                              className="p-1 text-violet-600 hover:bg-violet-50 rounded"
                              title="Voir les statistiques d'activite"
                              aria-label="Statistiques d'activite"
                            >
                              <BarChart3 className="w-4 h-4" />
                            </button>
                            {onViewConversations && (
                              <button
                                onClick={() => onViewConversations(commercial.id, commercial.poste_id ?? '')}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                title="Voir les conversations"
                                aria-label="Voir les conversations"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEditModal(commercial)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              disabled={loading}
                              title="Modifier"
                              aria-label="Modifier"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => void handleDeleteCommercial(commercial.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              disabled={loading}
                              title="Supprimer"
                              aria-label="Supprimer"
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

        </>
      )}

      {/* ─── Contenu onglet Détail ────────────────────────────────────── */}
      {activeTab === 'detail' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Filtre par commercial */}
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              <label htmlFor="detail-filter-commercial" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Commercial
              </label>
              <select
                id="detail-filter-commercial"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedDetail?.id ?? ''}
                onChange={(e) => {
                  const commercial = commerciaux.find((c) => c.id === e.target.value);
                  setSelectedDetail(commercial ?? null);
                }}
              >
                <option value="">— Sélectionner un commercial —</option>
                {commerciaux.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.isConnected ? ' 🟢' : ' ⚫'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!selectedDetail ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
              <UserCircle className="w-10 h-10 opacity-30" />
              <p className="text-sm">Sélectionnez un commercial dans le filtre ci-dessus pour afficher ses détails.</p>
            </div>
          ) : (
            <>
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                      {selectedDetail.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 ${getStatusColor(selectedDetail.isConnected)} border-2 border-white rounded-full`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{selectedDetail.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {selectedDetail.email}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedDetail.poste_name || 'Non assigné'}</span>
                    </div>
                  </div>
                </div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${selectedDetail.isConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {selectedDetail.isConnected ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>

              <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageCircle className="w-4 h-4 text-blue-600" />
                    <span className="text-xs text-blue-700 font-medium">Messages envoyés</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">{selectedDetail.nbMessagesEnvoyes}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-green-700 font-medium">Messages reçus</span>
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
                    <span className="text-xs text-orange-700 font-medium">Taux réponse</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-900">{selectedDetail.tauxReponse}%</p>
                </div>
              </div>

              <div className="px-6 pb-6 grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Performance</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Temps réponse moyen</span>
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
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Lu sans réponse</span>
                      <span className={`font-semibold ${selectedDetail.nbMessagesLusSansReponse >= 1 ? 'text-orange-600' : 'text-gray-400'}`}>
                        {selectedDetail.nbMessagesLusSansReponse}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Informations</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Dernière connexion</span>
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
            </>
          )}
        </div>
      )}

      {/* ─── Contenu onglet Statistiques ──────────────────────────────── */}
      {activeTab === 'statistiques' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Filtre par commercial */}
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              <label htmlFor="stats-filter-commercial" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Commercial
              </label>
              <select
                id="stats-filter-commercial"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={statsPanel?.id ?? ''}
                onChange={(e) => {
                  const commercial = commerciaux.find((c) => c.id === e.target.value);
                  if (commercial) void handleOpenStatsPanel(commercial);
                  else setStatsPanel(null);
                }}
              >
                <option value="">— Sélectionner un commercial —</option>
                {commerciaux.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.isConnected ? ' 🟢' : ' ⚫'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!statsPanel ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
              <BarChart3 className="w-10 h-10 opacity-30" />
              <p className="text-sm">Sélectionnez un commercial dans le filtre ci-dessus pour afficher ses métriques.</p>
            </div>
          ) : (
            <>
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Statistiques — {statsPanel.name}
                  </h3>
                  <p className="text-sm text-gray-500">{statsPanel.email}</p>
                </div>
                <button
                  onClick={() => void handleRefreshStats(statsPanel.id)}
                  disabled={statsLoading[statsPanel.id]}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 transition-colors"
                  aria-label="Rafraichir les statistiques"
                >
                  <RefreshCw className={`w-4 h-4 ${statsLoading[statsPanel.id] ? 'animate-spin' : ''}`} />
                  Rafraichir
                </button>
              </div>

              <div className="p-6">
                {statsLoading[statsPanel.id] && !statsMap[statsPanel.id] ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent" />
                  </div>
                ) : statsMap[statsPanel.id] ? (
                  <>
                    {/* Statut en ligne */}
                    <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 w-fit">
                      {statsMap[statsPanel.id].isOnline ? (
                        <Wifi className="w-4 h-4 text-green-500" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-sm text-gray-700">
                        {statsMap[statsPanel.id].isOnline ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </div>

                    {/* Toggle mode Messages / Conversations */}
                    <ModeToggle value={statsMode} onChange={setStatsMode} />

                    {/* Temps de connexion — indépendant du mode */}
                    {statsMap[statsPanel.id].totalConnectionMinutes != null && (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6 flex items-center gap-4">
                        <Timer className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-indigo-700 font-medium">Temps de connexion</p>
                          <p className="text-xl font-bold text-indigo-900">
                            {formatTemps((statsMap[statsPanel.id].totalConnectionMinutes ?? 0) * 60)}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ── Mode Messages ── */}
                    {statsMode === 'messages' && (
                      <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                          <div className="bg-blue-50 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <MessageCircle className="w-4 h-4 text-blue-600" />
                              <span className="text-xs text-blue-700 font-medium">Messages recus</span>
                            </div>
                            <p className="text-2xl font-bold text-blue-900">
                              {statsMap[statsPanel.id].messagesRead}
                            </p>
                          </div>

                          <div className="bg-green-50 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCheck className="w-4 h-4 text-green-600" />
                              <span className="text-xs text-green-700 font-medium">Messages traites</span>
                            </div>
                            <p className="text-2xl font-bold text-green-900">
                              {statsMap[statsPanel.id].messagesHandled}
                            </p>
                          </div>

                          <div className="bg-purple-50 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <Activity className="w-4 h-4 text-purple-600" />
                              <span className="text-xs text-purple-700 font-medium">Conv. actives</span>
                            </div>
                            <p className="text-2xl font-bold text-purple-900">
                              {statsMap[statsPanel.id].activeConversations}
                            </p>
                          </div>

                          <div className="bg-orange-50 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="w-4 h-4 text-orange-600" />
                              <span className="text-xs text-orange-700 font-medium">Derniere activite</span>
                            </div>
                            <p className="text-sm font-semibold text-orange-900 leading-tight">
                              {formatDate(statsMap[statsPanel.id].lastActivityAt)}
                            </p>
                          </div>
                        </div>

                        {/* Taux de reponse messages */}
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-700">Taux de reponse</span>
                            <span
                              className={`text-lg font-bold ${
                                statsMap[statsPanel.id].responseRate >= 80
                                  ? 'text-green-600'
                                  : statsMap[statsPanel.id].responseRate >= 60
                                    ? 'text-orange-500'
                                    : 'text-red-500'
                              }`}
                            >
                              {statsMap[statsPanel.id].responseRate.toFixed(1)}%
                            </span>
                          </div>
                          <div
                            className="w-full h-3 bg-gray-100 rounded-full overflow-hidden"
                            role="progressbar"
                            aria-valuenow={statsMap[statsPanel.id].responseRate}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Taux de reponse : ${statsMap[statsPanel.id].responseRate.toFixed(1)}%`}
                          >
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                statsMap[statsPanel.id].responseRate >= 80
                                  ? 'bg-green-500'
                                  : statsMap[statsPanel.id].responseRate >= 60
                                    ? 'bg-orange-400'
                                    : 'bg-red-400'
                              }`}
                              style={{ width: `${Math.min(statsMap[statsPanel.id].responseRate, 100)}%` }}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* ── Mode Conversations ── */}
                    {statsMode === 'conversations' && (
                      <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                          <div className="bg-blue-50 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <Inbox className="w-4 h-4 text-blue-600" />
                              <span className="text-xs text-blue-700 font-medium">Conv. reçues</span>
                            </div>
                            <p className="text-2xl font-bold text-blue-900">
                              {statsMap[statsPanel.id].conversationsReceived ?? 0}
                            </p>
                          </div>

                          <div className="bg-green-50 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <Reply className="w-4 h-4 text-green-600" />
                              <span className="text-xs text-green-700 font-medium">Répondues</span>
                            </div>
                            <p className="text-2xl font-bold text-green-900">
                              {statsMap[statsPanel.id].conversationsReplied ?? 0}
                            </p>
                          </div>

                          <div className="bg-emerald-50 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                              <span className="text-xs text-emerald-700 font-medium">Traitées</span>
                            </div>
                            <p className="text-2xl font-bold text-emerald-900">
                              {statsMap[statsPanel.id].conversationsHandled ?? 0}
                            </p>
                          </div>

                          <div className="bg-purple-50 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <Activity className="w-4 h-4 text-purple-600" />
                              <span className="text-xs text-purple-700 font-medium">Actives</span>
                            </div>
                            <p className="text-2xl font-bold text-purple-900">
                              {statsMap[statsPanel.id].activeConversations}
                            </p>
                          </div>
                        </div>

                        {/* Taux de réponse conversations */}
                        {(statsMap[statsPanel.id].conversationsReceived ?? 0) > 0 && (
                          <ConvRateBar
                            label="Taux de réponse"
                            value={Math.min(
                              Math.round(((statsMap[statsPanel.id].conversationsReplied ?? 0) / (statsMap[statsPanel.id].conversationsReceived ?? 1)) * 1000) / 10,
                              100,
                            )}
                          />
                        )}

                        {/* Taux de traitement */}
                        {(statsMap[statsPanel.id].conversationsReplied ?? 0) > 0 && (
                          <ConvRateBar
                            label="Taux de traitement"
                            value={Math.min(
                              Math.round(((statsMap[statsPanel.id].conversationsHandled ?? 0) / (statsMap[statsPanel.id].conversationsReplied ?? 1)) * 1000) / 10,
                              100,
                            )}
                          />
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">
                    Aucune donnee disponible.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Contenu onglet Lus sans réponse ─────────────────────────── */}
      {activeTab === 'lus-sans-reponse' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {chatsSansReponseCommercial
                  ? `${chatsSansReponseCommercial.name} — Conversations lues sans réponse`
                  : 'Conversations lues sans réponse'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('liste')}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              Retour à la liste
            </button>
          </div>

          <div className="p-4">
            {chatsSansReponseLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent" />
              </div>
            ) : chatsSansReponse.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <MessageCircle className="w-10 h-10 opacity-30" />
                <p className="text-sm">Aucune conversation lue sans réponse</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dernière activité</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lu le</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {chatsSansReponse.map((chat) => (
                      <tr key={chat.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {chat.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {chat.contact_client || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            chat.status === 'actif'
                              ? 'bg-green-100 text-green-800'
                              : chat.status === 'en attente'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-gray-100 text-gray-600'
                          }`}>
                            {chat.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatRelativeDate(chat.last_activity_at)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatRelativeDate(chat.last_read_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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


