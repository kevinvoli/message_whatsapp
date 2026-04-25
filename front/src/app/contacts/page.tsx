'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Phone,
  PhoneCall,
  Clock,
  Tag,
  MessageSquare,
  PhoneMissed,
  User,
  Archive,
  RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useContactStore } from '@/store/contactStore';
import { useChatStore } from '@/store/chatStore';
import {
  Contact,
  CallStatus,
  getCallStatusColor,
  getCallStatusLabel,
} from '@/types/chat';
import { formatDate, formatDateShort, formatTime } from '@/lib/dateUtils';
import { ContactTimeline } from '@/components/contacts/ContactTimeline';
import { updateContactCallStatus, searchClients, ClientSummary } from '@/lib/contactApi';
import { logger } from '@/lib/logger';

// ─── Badges ──────────────────────────────────────────────────────────────────

function CallStatusBadge({ status }: { status: CallStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${getCallStatusColor(status)}`}>
      {getCallStatusLabel(status)}
    </span>
  );
}

function ConversionBadge({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, string> = {
    nouveau:  'bg-blue-50 text-blue-700',
    prospect: 'bg-indigo-50 text-indigo-700',
    client:   'bg-emerald-50 text-emerald-700',
    perdu:    'bg-red-50 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

function CategoryBadge({ category }: { category?: string | null }) {
  if (!category) return null;
  const map: Record<string, string> = {
    jamais_commande:           'bg-gray-100 text-gray-600 border border-gray-200',
    commande_sans_livraison:   'bg-orange-50 text-orange-700 border border-orange-200',
    commande_avec_livraison:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
    commande_annulee:          'bg-red-50 text-red-700 border border-red-200',
  };
  const labels: Record<string, string> = {
    jamais_commande:           'Jamais commandé',
    commande_sans_livraison:   'Sans livraison',
    commande_avec_livraison:   'Livré',
    commande_annulee:          'Annulé',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[category] ?? 'bg-gray-100 text-gray-700'}`}>
      {labels[category] ?? category}
    </span>
  );
}

function CertifBadge({ status }: { status?: string | null }) {
  if (!status || status === 'non_verifie') return null;
  const map: Record<string, string> = {
    certifie:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
    en_attente:  'bg-yellow-50 text-yellow-700 border border-yellow-200',
    rejete:      'bg-red-50 text-red-700 border border-red-200',
  };
  const labels: Record<string, string> = {
    certifie: '✓ Certifié', en_attente: '⏳ En attente', rejete: '✗ Rejeté',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ─── Modal modification statut + notes ───────────────────────────────────────

interface EditModalProps {
  contact: Contact;
  onClose: () => void;
  onConfirm: (status: CallStatus, notes: string) => void;
}

function EditModal({ contact, onClose, onConfirm }: EditModalProps) {
  const [status, setStatus] = useState<CallStatus>(contact.call_status);
  const [notes,  setNotes]  = useState(contact.call_notes ?? '');

  const opts: { value: CallStatus; label: string; icon: React.ReactNode }[] = [
    { value: 'appelé',        label: 'Appelé',         icon: <PhoneCall className="w-4 h-4" /> },
    { value: 'rappeler',      label: 'À rappeler',     icon: <Clock className="w-4 h-4" />     },
    { value: 'non_joignable', label: 'Non joignable',  icon: <PhoneMissed className="w-4 h-4" /> },
    { value: 'à_appeler',     label: 'À appeler',      icon: <Phone className="w-4 h-4" />     },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Modifier le contact</h3>
        <p className="text-sm text-gray-500 mb-5">{contact.name} · {contact.contact}</p>

        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Statut d&apos;appel
          </label>
          <div className="grid grid-cols-2 gap-2">
            {opts.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  status === opt.value
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ajouter des notes sur ce contact…"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onConfirm(status, notes)}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Fiche détail ─────────────────────────────────────────────────────────────

interface ContactDetailsProps {
  contact: Contact;
  onEditClick: () => void;
  onViewConversation: () => void;
  onArchive: () => void;
}

function ContactDetails({ contact, onEditClick, onViewConversation, onArchive }: ContactDetailsProps) {
  const initial = contact.name.charAt(0).toUpperCase();

  // Log messages : les 5 derniers triés par date desc
  const recentMessages = useMemo(
    () =>
      [...(contact.messages ?? [])]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 5),
    [contact.messages],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Carte principale */}
      <div className="bg-white rounded-[18px] p-5" style={{ boxShadow: '0 12px 40px rgba(15,23,42,0.08)' }}>
        {/* En-tête contact */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #2563eb, #6366f1)' }}
            >
              {initial}
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 leading-tight">{contact.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">{contact.contact}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <CallStatusBadge status={contact.call_status} />
            <ConversionBadge status={contact.conversion_status} />
            <CategoryBadge category={contact.client_category} />
            <CertifBadge status={contact.certification_status} />
          </div>
        </div>

        {/* Timeline pills */}
        <ContactTimeline contact={contact} />

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onViewConversation}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Voir la conversation
          </button>
          <button
            onClick={onArchive}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-800 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
          >
            <Archive className="w-4 h-4" />
            Archiver
          </button>
        </div>
      </div>

      {/* Informations — 2 colonnes comme dans le mockup */}
      <div
        className="bg-white rounded-[18px] p-5 border border-gray-100"
        style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 18 }}
      >
        {/* Colonne gauche */}
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-semibold text-gray-800">Conversion</p>
            <p className="text-gray-500 mt-0.5">{contact.conversion_status ?? '—'}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Source</p>
            <p className="text-gray-500 mt-0.5">{contact.source ?? '—'}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Chat ID</p>
            <p className="text-gray-500 mt-0.5 font-mono text-xs truncate">{contact.chat_id}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Statut actif</p>
            <p className={`mt-0.5 font-medium ${contact.is_active ? 'text-emerald-600' : 'text-red-600'}`}>
              {contact.is_active ? 'Oui' : 'Non'}
            </p>
          </div>
          {contact.call_notes && (
            <div>
              <p className="font-semibold text-gray-800">Notes</p>
              <p className="text-gray-500 mt-0.5 text-xs whitespace-pre-wrap">{contact.call_notes}</p>
            </div>
          )}
          {contact.tags && contact.tags.length > 0 && (
            <div>
              <p className="font-semibold text-gray-800 mb-1">Tags</p>
              <div className="flex flex-wrap gap-1">
                {contact.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Colonne droite */}
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-semibold text-gray-800">Dernière mise à jour</p>
            <p className="text-gray-500 mt-0.5">{formatDate(contact.updatedAt)}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Total messages</p>
            <p className="text-gray-500 mt-0.5">{contact.total_messages ?? 0}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Appels</p>
            <p className="text-gray-500 mt-0.5">{contact.call_count}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Statut</p>
            <p className="text-gray-500 mt-0.5 capitalize">{contact.call_status.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Priorité</p>
            <p className="text-gray-500 mt-0.5 capitalize">{contact.priority ?? 'moyenne'}</p>
          </div>
        </div>
      </div>

      {/* Intégration ERP */}
      {(contact.order_client_id || contact.referral_code || contact.referral_count || contact.certified_at) && (
        <div className="bg-white rounded-[18px] p-5 border border-gray-100">
          <h3 className="text-base font-bold text-gray-900 mb-3">Intégration ERP</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {contact.order_client_id && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">ID Client ERP</p>
                <p className="font-mono text-gray-800">{contact.order_client_id}</p>
              </div>
            )}
            {contact.referral_code && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Code parrainage</p>
                <p className="font-mono text-gray-800">{contact.referral_code}</p>
              </div>
            )}
            {(contact.referral_count ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Filleuls</p>
                <p className="text-gray-800">{contact.referral_count}</p>
              </div>
            )}
            {contact.referral_commission != null && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Commission parrainage</p>
                <p className="text-gray-800">{contact.referral_commission} FCFA</p>
              </div>
            )}
            {contact.certified_at && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Certifié le</p>
                <p className="text-gray-800">{formatDateShort(contact.certified_at)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="bg-white rounded-[18px] p-5 border border-gray-100">
        <h3 className="text-base font-bold text-gray-900 mb-3">Historique</h3>

        {recentMessages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucun message enregistré</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {recentMessages.map((msg) => (
              <div key={msg.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-700">
                  {msg.from_me ? '💬 Message sortant' : '📩 Message entrant'}
                  {msg.text ? ` — ${msg.text.slice(0, 40)}${msg.text.length > 40 ? '…' : ''}` : ' [Media]'}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
                  {formatTime(msg.timestamp)} · {formatDateShort(msg.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ContactsPage() {
  const router = useRouter();

  const { selectedContactDetail: selectedContact, isLoadingDetail: isLoading, selectContactByChatId, upsertContact } =
    useContactStore();
  const { selectConversation } = useChatStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  // ── Liste clients depuis l'API ──
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientsLoading, setClientsLoading] = useState(false);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const res = await searchClients({ search: searchQuery.trim() || undefined, limit: 100 });
      setClients(res.data);
      setClientsTotal(res.total);
    } catch { /* ignore */ }
    finally { setClientsLoading(false); }
  }, [searchQuery]);

  useEffect(() => { void loadClients(); }, [loadClients]);

  function handleViewConversation() {
    if (!selectedContact?.chat_id) return;
    selectConversation(selectedContact.chat_id);
    router.push('/whatsapp');
  }

  async function handleConfirmEdit(status: CallStatus, notes: string) {
    if (!selectedContact) return;
    try {
      await updateContactCallStatus(selectedContact.id, status, notes);
      upsertContact({
        ...selectedContact,
        call_status:    status,
        call_notes:     notes,
        last_call_date: new Date(),
        call_count:     (selectedContact.call_count ?? 0) + 1,
      });
    } catch (error) {
      logger.error('Failed to update contact call status', {
        contact_id: selectedContact.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    setShowEditModal(false);
  }

  function handleArchive() {
    // TODO: émettre socket pour archiver le contact
  }

  // Spinner si chargement du détail
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Chargement des contacts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-100 p-7">
      <div className="grid gap-6 h-full" style={{ gridTemplateColumns: '280px 1fr' }}>

        {/* ── Volet gauche sticky ── */}
        <div className="sticky top-5 self-start flex flex-col gap-4">
          {/* Recherche */}
          <div
            className="bg-white rounded-[18px] p-5"
            style={{ boxShadow: '0 12px 40px rgba(15,23,42,0.08)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un client…"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <button onClick={loadClients} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <RefreshCw className={`w-4 h-4 ${clientsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {clientsTotal > 0 && (
              <p className="text-xs text-gray-400">{clientsTotal} client{clientsTotal > 1 ? 's' : ''}</p>
            )}
          </div>

          {/* Liste clients */}
          <div
            className="bg-white rounded-[18px] p-5"
            style={{ boxShadow: '0 12px 40px rgba(15,23,42,0.08)' }}
          >
            <h2 className="text-base font-bold text-gray-900 mb-3">Clients</h2>

            {clientsLoading && clients.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-6">
                <User className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Aucun client trouvé</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-h-[420px] overflow-y-auto pr-0.5">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => selectContactByChatId(client.chat_id)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors ${
                      selectedContact?.id === client.id ? 'bg-green-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                      {(client.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{client.name}</p>
                      <p className="text-xs text-gray-400 truncate">{client.phone}</p>
                    </div>
                    {client.next_follow_up && (
                      <span className="text-xs bg-orange-100 text-orange-600 rounded-full px-1.5 py-0.5">Relance</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Colonne principale ── */}
        <div>
          {selectedContact ? (
            <ContactDetails
              contact={selectedContact}
              onEditClick={() => setShowEditModal(true)}
              onViewConversation={handleViewConversation}
              onArchive={handleArchive}
            />
          ) : (
            <div
              className="bg-white rounded-[18px] h-64 flex items-center justify-center"
              style={{ boxShadow: '0 12px 40px rgba(15,23,42,0.08)' }}
            >
              <div className="text-center">
                <User className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  Sélectionnez un contact pour afficher ses détails
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal modification */}
      {showEditModal && selectedContact && (
        <EditModal
          contact={selectedContact}
          onClose={() => setShowEditModal(false)}
          onConfirm={handleConfirmEdit}
        />
      )}
    </div>
  );
}
