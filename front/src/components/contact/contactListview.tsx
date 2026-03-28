import React, { useState, useMemo } from 'react';
import {
  Phone,
  PhoneCall,
  PhoneMissed,
  Clock,
  Search,
  Filter,
  Calendar,
  MessageSquare,
  Tag,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  User,
  Mail,
  MapPin,
  TrendingUp,
  Check,
  X,
} from 'lucide-react';
import { Contact, CallStatus, ContactFilters } from '@/types/chat';
import { formatRelativeDate } from '@/lib/dateUtils';

interface ContactsListViewProps {
  contacts: Contact[];
  onCallStatusChange: (contactId: string, callStatus: CallStatus, notes?: string) => void;
  onRefresh?: () => void;
  onExport?: () => void;
}

export const ContactsListView: React.FC<ContactsListViewProps> = ({
  contacts,
  onCallStatusChange,
  onRefresh,
  onExport,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ContactFilters>({
    call_status: [],
    conversion_status: [],
    priority: [],
    sort_by: 'last_call',
    sort_order: 'desc',
  });
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [callModalData, setCallModalData] = useState<{
    status: CallStatus;
    notes: string;
  }>({
    status: 'appelé',
    notes: '',
  });

  // Filtrage et tri des contacts
  const filteredContacts = useMemo(() => {
    let result = [...contacts];

    // Recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (contact) =>
          contact.name.toLowerCase().includes(query) ||
          contact.contact.includes(query) ||
          contact.call_notes?.toLowerCase().includes(query)
      );
    }

    // Filtres par statut d'appel
    if (filters.call_status && filters.call_status.length > 0) {
      result = result.filter((contact) =>
        filters.call_status!.includes(contact.call_status)
      );
    }

    // Filtres par statut de conversion
    if (filters.conversion_status && filters.conversion_status.length > 0) {
      result = result.filter((contact) =>
        filters.conversion_status!.includes(contact.conversion_status || '')
      );
    }

    // Filtres par priorité
    if (filters.priority && filters.priority.length > 0) {
      result = result.filter((contact) =>
        filters.priority!.includes(contact.priority || 'moyenne')
      );
    }

    // Tri
    result.sort((a, b) => {
      let comparison = 0;
      switch (filters.sort_by) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'last_call':
          comparison =
            (b.last_call_date?.getTime() || 0) -
            (a.last_call_date?.getTime() || 0);
          break;
        case 'next_call':
          comparison =
            (a.next_call_date?.getTime() || Infinity) -
            (b.next_call_date?.getTime() || Infinity);
          break;
        case 'priority':
          const priorityOrder = { haute: 0, moyenne: 1, basse: 2 };
          comparison =
            priorityOrder[a.priority || 'moyenne'] -
            priorityOrder[b.priority || 'moyenne'];
          break;
        case 'created_at':
          comparison = b.createdAt.getTime() - a.createdAt.getTime();
          break;
      }
      return filters.sort_order === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [contacts, searchQuery, filters]);

  const handleCallClick = (contact: Contact) => {
    setSelectedContact(contact);
    setCallModalData({
      status: 'appelé',
      notes: contact.call_notes || '',
    });
    setShowCallModal(true);
  };

  const handleConfirmCall = () => {
    if (selectedContact) {
      onCallStatusChange(
        selectedContact.id,
        callModalData.status,
        callModalData.notes
      );
      setShowCallModal(false);
      setSelectedContact(null);
    }
  };

  const formatDate = (date: Date | undefined) => formatRelativeDate(date);

  const getCallStatusBadge = (status: CallStatus) => {
    const badges = {
      appelé: {
        bg: 'bg-green-100',
        text: 'text-green-800',
        icon: <PhoneCall className="w-3 h-3" />,
        label: 'Appelé',
      },
      à_appeler: {
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        icon: <Phone className="w-3 h-3" />,
        label: 'À appeler',
      },
      rappeler: {
        bg: 'bg-orange-100',
        text: 'text-orange-800',
        icon: <Clock className="w-3 h-3" />,
        label: 'À rappeler',
      },
      non_joignable: {
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        icon: <PhoneMissed className="w-3 h-3" />,
        label: 'Non joignable',
      },
    };

    const badge = badges[status];
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
      >
        {badge.icon}
        {badge.label}
      </span>
    );
  };

  const getPriorityBadge = (priority?: string) => {
    const badges = {
      haute: { bg: 'bg-red-100', text: 'text-red-800', label: 'Haute' },
      moyenne: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Moyenne' },
      basse: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Basse' },
    };

    const badge = badges[priority as keyof typeof badges] || badges.moyenne;
    return (
      <span
        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
      >
        {badge.label}
      </span>
    );
  };

  const stats = useMemo(() => {
    return {
      total: contacts.length,
      à_appeler: contacts.filter((c) => c.call_status === 'à_appeler').length,
      appelé: contacts.filter((c) => c.call_status === 'appelé').length,
      rappeler: contacts.filter((c) => c.call_status === 'rappeler').length,
      non_joignable: contacts.filter((c) => c.call_status === 'non_joignable')
        .length,
    };
  }, [contacts]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* En-tête */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Liste des clients
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Gérez vos appels et suivez vos prospects
            </p>
          </div>
          <div className="flex items-center gap-3">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Actualiser"
              >
                <RefreshCw className="w-5 h-5 text-gray-600" />
              </button>
            )}
            {onExport && (
              <button
                onClick={onExport}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm font-medium">Exporter</span>
              </button>
            )}
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600 mb-1">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-600 mb-1">À appeler</p>
            <p className="text-2xl font-bold text-blue-900">{stats.à_appeler}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs text-green-600 mb-1">Appelés</p>
            <p className="text-2xl font-bold text-green-900">{stats.appelé}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-3">
            <p className="text-xs text-orange-600 mb-1">À rappeler</p>
            <p className="text-2xl font-bold text-orange-900">{stats.rappeler}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600 mb-1">Non joignables</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.non_joignable}
            </p>
          </div>
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filtres</span>
            {showFilters ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Panneau de filtres */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Statut d'appel
                </label>
                <div className="space-y-2">
                  {['à_appeler', 'appelé', 'rappeler', 'non_joignable'].map(
                    (status) => (
                      <label
                        key={status}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={filters.call_status?.includes(
                            status as CallStatus
                          )}
                          onChange={(e) => {
                            const newStatuses = e.target.checked
                              ? [...(filters.call_status || []), status as CallStatus]
                              : filters.call_status?.filter((s) => s !== status);
                            setFilters({ ...filters, call_status: newStatuses });
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                          {status.replace('_', ' ')}
                        </span>
                      </label>
                    )
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Priorité
                </label>
                <div className="space-y-2">
                  {['haute', 'moyenne', 'basse'].map((priority) => (
                    <label
                      key={priority}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={filters.priority?.includes(priority as any)}
                        onChange={(e) => {
                          const newPriorities = e.target.checked
                            ? [...(filters.priority || []), priority as any]
                            : filters.priority?.filter((p) => p !== priority);
                          setFilters({ ...filters, priority: newPriorities });
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 capitalize">
                        {priority}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Trier par
                </label>
                <select
                  value={filters.sort_by}
                  onChange={(e) =>
                    setFilters({ ...filters, sort_by: e.target.value as any })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="last_call">Dernier appel</option>
                  <option value="next_call">Prochain appel</option>
                  <option value="name">Nom</option>
                  <option value="priority">Priorité</option>
                  <option value="created_at">Date de création</option>
                </select>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() =>
                      setFilters({ ...filters, sort_order: 'asc' })
                    }
                    className={`flex-1 px-3 py-1 text-xs rounded ${
                      filters.sort_order === 'asc'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-700'
                    }`}
                  >
                    Croissant
                  </button>
                  <button
                    onClick={() =>
                      setFilters({ ...filters, sort_order: 'desc' })
                    }
                    className={`flex-1 px-3 py-1 text-xs rounded ${
                      filters.sort_order === 'desc'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-700'
                    }`}
                  >
                    Décroissant
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Liste des contacts */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-3">
          {filteredContacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow p-4"
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                  {contact.name.charAt(0).toUpperCase()}
                </div>

                {/* Informations principales */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {contact.name}
                      </h3>
                      <p className="text-sm text-gray-600">{contact.contact}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getPriorityBadge(contact.priority)}
                      {getCallStatusBadge(contact.call_status)}
                    </div>
                  </div>

                  {/* Statistiques du contact */}
                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>
                        Dernier appel: {formatDate(contact.last_call_date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <PhoneCall className="w-4 h-4" />
                      <span>{contact.call_count || 0} appel(s)</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MessageSquare className="w-4 h-4" />
                      <span>{contact.total_messages || 0} message(s)</span>
                    </div>
                    {contact.source && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4" />
                        <span>{contact.source}</span>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {contact.call_notes && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-3">
                      <p className="text-xs text-yellow-800">
                        <strong>Notes:</strong> {contact.call_notes}
                      </p>
                    </div>
                  )}

                  {/* Prochain appel prévu */}
                  {contact.next_call_date && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-3">
                      <p className="text-xs text-blue-800">
                        <strong>Prochain appel:</strong>{' '}
                        {formatDate(contact.next_call_date)}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCallClick(contact)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <Phone className="w-4 h-4" />
                      Marquer comme appelé
                    </button>
                    {contact.tags && contact.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {contact.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs"
                          >
                            <Tag className="w-3 h-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredContacts.length === 0 && (
            <div className="text-center py-12">
              <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Aucun contact trouvé
              </h3>
              <p className="text-sm text-gray-600">
                Essayez de modifier vos filtres ou votre recherche
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal d'appel */}
      {showCallModal && selectedContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Marquer l'appel
              </h3>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-gray-900">
                  <strong>Client:</strong> {selectedContact.name}
                </p>
                <p className="text-sm text-gray-900">
                  <strong>Téléphone:</strong> {selectedContact.contact}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Dernier appel: {formatDate(selectedContact.last_call_date)}
                </p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Statut de l'appel
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(['appelé', 'rappeler', 'non_joignable', 'à_appeler'] as CallStatus[]).map(
                  (status) => (
                    <button
                      key={status}
                      onClick={() =>
                        setCallModalData({ ...callModalData, status })
                      }
                      className={`p-3 rounded-lg border-2 transition-all ${
                        callModalData.status === status
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {status === 'appelé' && <PhoneCall className="w-5 h-5" />}
                        {status === 'rappeler' && <Clock className="w-5 h-5" />}
                        {status === 'non_joignable' && (
                          <PhoneMissed className="w-5 h-5" />
                        )}
                        {status === 'à_appeler' && <Phone className="w-5 h-5" />}
                        <span className="text-sm font-medium">
                          {status === 'appelé' ? 'Appelé'
                            : status === 'rappeler' ? 'À rappeler'
                            : status === 'non_joignable' ? 'Non joignable'
                            : 'Appel initial'}
                        </span>
                      </div>
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (optionnel)
              </label>
              <textarea
                value={callModalData.notes}
                onChange={(e) =>
                  setCallModalData({ ...callModalData, notes: e.target.value })
                }
                placeholder="Ajouter des notes sur cet appel..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCallModal(false);
                  setSelectedContact(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmCall}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
