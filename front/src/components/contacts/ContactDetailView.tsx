'use client';

// Données provenant du backend via WebSocket (useContactStore)

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Phone,
  PhoneCall,
  Clock,
  MessageSquare,
  PhoneMissed,
  User,
  Edit2,
  Check,
  X as XIcon,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useContactStore } from '@/store/contactStore';
import { useChatStore } from '@/store/chatStore';
import { CallStatus, convToContact, getCallStatusColor, getCallStatusLabel } from '@/types/chat';
import { formatDate, formatDateShort, formatTime, formatRelativeDate } from '@/lib/dateUtils';
import { ContactTimeline } from './ContactTimeline';
import { CallLogHistory } from './CallLogHistory';
import { updateContactCallStatus, getCrmFields, setCrmFields, CrmFieldEntry, CrmRawValue } from '@/lib/contactApi';
import { getFollowUpsByContact } from '@/lib/followUpApi';
import { FollowUp, FollowUpStatus, FOLLOW_UP_TYPE_LABELS } from '@/types/chat';
import { logger } from '@/lib/logger';
import dynamic from 'next/dynamic';

const CreateFollowUpModal = dynamic(() => import('@/components/chat/CreateFollowUpModal'), { ssr: false });

const FOLLOWUP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  planifiee: 'Planifiée',
  en_retard: 'En retard',
  effectuee: 'Effectuée',
  annulee:   'Annulée',
};
const FOLLOWUP_STATUS_COLORS: Record<FollowUpStatus, { bg: string; text: string }> = {
  planifiee: { bg: '#eff6ff', text: '#2563eb' },
  en_retard: { bg: '#fef2f2', text: '#dc2626' },
  effectuee: { bg: '#ecfdf5', text: '#059669' },
  annulee:   { bg: '#f9fafb', text: '#6b7280' },
};

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';
const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface DossierSynthesis {
  summary: string;
  parcours_description: string;
  next_action_suggested: string;
  risk_level: 'faible' | 'moyen' | 'élevé';
  key_signals: string[];
}

// ─── Modal modification ───────────────────────────────────────────────────────

type CallOutcomeValue = 'répondu' | 'messagerie' | 'pas_de_réponse' | 'occupé';

interface EditModalProps {
  name: string;
  phone: string;
  currentStatus: CallStatus;
  currentNotes: string;
  onClose: () => void;
  onConfirm: (status: CallStatus, notes: string, outcome?: CallOutcomeValue, durationSec?: number) => void;
}

function EditModal({ name, phone, currentStatus, currentNotes, onClose, onConfirm }: EditModalProps) {
  const [status,      setStatus]      = useState<CallStatus>(currentStatus);
  const [notes,       setNotes]       = useState(currentNotes);
  const [outcome,     setOutcome]     = useState<CallOutcomeValue | ''>('');
  const [durationMin, setDurationMin] = useState('');
  const [durationSec, setDurationSec] = useState('');

  const statusOpts: { value: CallStatus; label: string; icon: React.ReactNode }[] = [
    { value: 'appelé',        label: 'Appelé',        icon: <PhoneCall   className="w-4 h-4" /> },
    { value: 'rappeler',      label: 'À rappeler',    icon: <Clock       className="w-4 h-4" /> },
    { value: 'non_joignable', label: 'Non joignable', icon: <PhoneMissed className="w-4 h-4" /> },
    { value: 'à_appeler',     label: 'Appel initial',  icon: <Phone       className="w-4 h-4" /> },
  ];

  const outcomeOpts: { value: CallOutcomeValue; label: string }[] = [
    { value: 'répondu',        label: 'Répondu' },
    { value: 'messagerie',     label: 'Messagerie' },
    { value: 'pas_de_réponse', label: 'Pas de réponse' },
    { value: 'occupé',         label: 'Occupé' },
  ];

  function handleConfirm() {
    const totalSec =
      (parseInt(durationMin || '0', 10) * 60) + parseInt(durationSec || '0', 10);
    onConfirm(status, notes, outcome || undefined, totalSec > 0 ? totalSec : undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Marquer l&apos;appel</h3>
        <p className="text-sm text-gray-500 mb-5">{name} · {phone}</p>

        {/* Statut d'appel */}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Statut d&apos;appel
        </p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {statusOpts.map((opt) => (
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

        {/* Résultat */}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Résultat de l&apos;appel
        </p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {outcomeOpts.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setOutcome(outcome === opt.value ? '' : opt.value)}
              className={`p-2.5 rounded-xl border text-sm font-medium transition-all ${
                outcome === opt.value
                  ? 'border-green-500 bg-green-50 text-green-800'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Durée */}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Durée (optionnel)
        </p>
        <div className="flex gap-2 mb-5">
          <div className="flex-1 relative">
            <input
              type="number"
              min="0"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">min</span>
          </div>
          <div className="flex-1 relative">
            <input
              type="number"
              min="0"
              max="59"
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">sec</span>
          </div>
        </div>

        {/* Notes */}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ajouter des notes…"
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 mb-5"
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={handleConfirm} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Vue détail (fidèle au mockup) ───────────────────────────────────────────

interface ContactDetailViewProps {
  onSwitchToConversations?: () => void;
}

export function ContactDetailView({ onSwitchToConversations }: ContactDetailViewProps) {
  const router = useRouter();
  const { selectedContactDetail: selectedContact, isLoadingDetail, upsertContact } = useContactStore();
  const { selectConversation, conversations } = useChatStore();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [contactFollowUps, setContactFollowUps] = useState<FollowUp[]>([]);
  const [crmFields, setCrmFieldsState] = useState<CrmFieldEntry[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<CrmRawValue>(null);
  const [crmSaving, setCrmSaving] = useState(false);
  const [dossierSynthesis, setDossierSynthesis] = useState<DossierSynthesis | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);

  const loadCrm = useCallback(async (contactId: string) => {
    try {
      const entries = await getCrmFields(contactId, TENANT_ID);
      setCrmFieldsState(entries);
    } catch { /* silently ignore */ }
  }, []);

  const loadFollowUps = useCallback(async (contactId: string) => {
    try {
      const data = await getFollowUpsByContact(contactId);
      setContactFollowUps(data);
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => {
    if (selectedContact?.id) {
      void loadCrm(selectedContact.id);
      void loadFollowUps(selectedContact.id);
    } else {
      setCrmFieldsState([]);
      setContactFollowUps([]);
    }
    setDossierSynthesis(null);
  }, [selectedContact?.id, loadCrm, loadFollowUps]);

  const handleSynthesizeDossier = useCallback(async () => {
    if (!selectedContact?.id) return;
    setLoadingDossier(true);
    try {
      const res = await fetch(`${API_URL}/ai/dossier/${selectedContact.id}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json() as DossierSynthesis;
        setDossierSynthesis(data);
      }
    } catch { /* silently ignore */ }
    finally { setLoadingDossier(false); }
  }, [selectedContact?.id]);

  function getCrmDisplayValue(entry: CrmFieldEntry): string {
    const v = entry.value;
    if (!v) return '—';
    const def = entry.definition;
    switch (def.field_type) {
      case 'text':
      case 'select':
        return v.value_text ?? '—';
      case 'number':
        return v.value_number != null ? String(v.value_number) : '—';
      case 'date':
        return v.value_date ?? '—';
      case 'boolean':
        return v.value_boolean != null ? (v.value_boolean ? 'Oui' : 'Non') : '—';
      case 'multiselect':
        return v.value_json?.join(', ') ?? '—';
      default:
        return '—';
    }
  }

  function getCrmEditDefault(entry: CrmFieldEntry): CrmRawValue {
    const v = entry.value;
    if (!v) {
      if (entry.definition.field_type === 'boolean') return false;
      if (entry.definition.field_type === 'multiselect') return [];
      return '';
    }
    switch (entry.definition.field_type) {
      case 'text': case 'select': return v.value_text ?? '';
      case 'number': return v.value_number ?? '';
      case 'date': return v.value_date ?? '';
      case 'boolean': return v.value_boolean != null ? Boolean(v.value_boolean) : false;
      case 'multiselect': return v.value_json ?? [];
      default: return '';
    }
  }

  function startEditField(entry: CrmFieldEntry) {
    setEditingField(entry.definition.field_key);
    setEditValue(getCrmEditDefault(entry));
  }

  async function saveField(entry: CrmFieldEntry) {
    if (!selectedContact) return;
    setCrmSaving(true);
    try {
      await setCrmFields(selectedContact.id, TENANT_ID, [{ field_key: entry.definition.field_key, value: editValue }]);
      await loadCrm(selectedContact.id);
      setEditingField(null);
    } catch { /* ignore */ }
    finally { setCrmSaving(false); }
  }

  // Contacts similaires dérivés des conversations (même source ou tags communs)
  const allContacts = useMemo(
    () => conversations.map(convToContact).filter(Boolean) as NonNullable<ReturnType<typeof convToContact>>[],
    [conversations],
  );

  const recentMessages = useMemo(
    () =>
      [...(selectedContact?.messages ?? [])]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 6),
    [selectedContact],
  );

  // ── Score d'engagement (0-100) ──
  const engagementScore = useMemo(() => {
    if (!selectedContact) return 0;
    const c = selectedContact;
    let score = 0;

    // Récence du dernier appel (0-25)
    if (c.last_call_date) {
      const days = (Date.now() - new Date(c.last_call_date).getTime()) / 86400000;
      if (days <= 7)  score += 25;
      else if (days <= 30) score += 15;
      else if (days <= 90) score += 5;
    }

    // Nb d'appels (0-25)
    score += Math.min((c.call_count ?? 0) * 5, 25);

    // Nb messages (0-25)
    score += Math.min((c.total_messages ?? 0), 25);

    // Conversion (0-25)
    const convScore: Record<string, number> = { nouveau: 0, prospect: 10, client: 25, perdu: 0 };
    score += convScore[c.conversion_status ?? 'nouveau'] ?? 0;

    return Math.min(score, 100);
  }, [selectedContact]);

  // ── Médias partagés ──
  const sharedMedias = useMemo(() => {
    const msgs = selectedContact?.messages ?? [];
    return msgs
      .flatMap((m) => (m.medias ?? []).map((med) => ({ ...med, timestamp: m.timestamp, from_me: m.from_me })))
      .filter((med) => ['image', 'video', 'document', 'audio', 'voice'].includes(med.type))
      .slice(0, 12);
  }, [selectedContact]);

  // ── Contacts similaires (même source ou tags communs) ──
  const similarContacts = useMemo(() => {
    if (!selectedContact) return [];
    const c = selectedContact;
    return allContacts
      .filter((other) => {
        if (other.id === c.id) return false;
        const sameSource = c.source && other.source === c.source;
        const sharedTag  = c.tags?.some((t) => other.tags?.includes(t));
        return sameSource || sharedTag;
      })
      .slice(0, 4);
  }, [selectedContact, allContacts]);

  async function handleConfirmEdit(
    status: CallStatus,
    notes: string,
    outcome?: string,
    durationSec?: number,
  ) {
    if (!selectedContact) return;
    try {
      await updateContactCallStatus(selectedContact.id, status, notes, outcome, durationSec);
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

  function handleViewConversation() {
    if (!selectedContact?.chat_id) return;
    selectConversation(selectedContact.chat_id);
    if (onSwitchToConversations) {
      onSwitchToConversations();
    } else {
      router.push('/whatsapp');
    }
  }

  // ── Chargement du détail ──
  if (isLoadingDetail) {
    return (
      <div className="flex-1 h-full flex items-center justify-center" style={{ background: '#f3f4f6' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Chargement du contact…</p>
        </div>
      </div>
    );
  }

  // ── État vide ──
  if (!selectedContact) {
    return (
      <div className="flex-1 h-full flex items-center justify-center" style={{ background: '#f3f4f6' }}>
        <div className="text-center">
          <User className="w-12 h-12 mx-auto mb-3" style={{ color: '#d1d5db' }} />
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Sélectionnez un contact dans la liste</p>
        </div>
      </div>
    );
  }

  const c = selectedContact;
  const initial = c.name.charAt(0).toUpperCase();

  // Badge call status
  const callStatusBadge = () => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      appelé:        { bg: '#ecfdf5', text: '#059669' },
      à_appeler:     { bg: '#eff6ff', text: '#2563eb' },
      rappeler:      { bg: '#fff7ed', text: '#ea580c' },
      non_joignable: { bg: '#f9fafb', text: '#6b7280' },
    };
    const colors = colorMap[c.call_status] ?? colorMap['à_appeler'];
    return (
      <span style={{ background: colors.bg, color: colors.text, borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '4px 10px' }}>
        {getCallStatusLabel(c.call_status)}
      </span>
    );
  };

  const conversionBadge = () => {
    if (!c.conversion_status) return null;
    const colorMap: Record<string, { bg: string; text: string }> = {
      nouveau:  { bg: '#eff6ff', text: '#2563eb' },
      prospect: { bg: '#eff6ff', text: '#2563eb' },
      client:   { bg: '#ecfdf5', text: '#059669' },
      perdu:    { bg: '#fef2f2', text: '#dc2626' },
    };
    const colors = colorMap[c.conversion_status] ?? { bg: '#f3f4f6', text: '#374151' };
    return (
      <span style={{ background: colors.bg, color: colors.text, borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '4px 10px', marginLeft: 6 }}>
        {c.conversion_status.charAt(0).toUpperCase() + c.conversion_status.slice(1)}
      </span>
    );
  };

  const certificationBadge = () => {
    if (!c.certification_status) return null;
    const colorMap: Record<string, { bg: string; text: string; label: string }> = {
      non_verifie: { bg: '#f3f4f6', text: '#6b7280', label: 'Non vérifié' },
      en_attente:  { bg: '#fff7ed', text: '#ea580c', label: 'En attente' },
      certifie:    { bg: '#ecfdf5', text: '#059669', label: '✓ Certifié' },
      rejete:      { bg: '#fef2f2', text: '#dc2626', label: 'Rejeté' },
    };
    const item = colorMap[c.certification_status] ?? colorMap['non_verifie'];
    return (
      <span style={{ background: item.bg, color: item.text, borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '4px 10px', marginLeft: 6 }}>
        {item.label}
      </span>
    );
  };

  const categoryBadge = () => {
    if (!c.client_category) return null;
    const colorMap: Record<string, { bg: string; text: string; label: string }> = {
      jamais_commande:         { bg: '#f3f4f6', text: '#6b7280',  label: 'Jamais commandé' },
      commande_sans_livraison: { bg: '#fff7ed', text: '#ea580c',  label: 'Sans livraison' },
      commande_avec_livraison: { bg: '#ecfdf5', text: '#059669',  label: 'Livré' },
      commande_annulee:        { bg: '#fef2f2', text: '#dc2626',  label: 'Annulé' },
    };
    const item = colorMap[c.client_category] ?? { bg: '#f3f4f6', text: '#6b7280', label: c.client_category };
    return (
      <span style={{ background: item.bg, color: item.text, borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '4px 10px', marginLeft: 6 }}>
        {item.label}
      </span>
    );
  };

  return (
    <div style={{ flex: 1, minWidth: 0, background: '#f3f4f6', padding: 28, height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>

      {/* ── Panneau principal ── */}
      <div style={{ background: 'white', borderRadius: 18, padding: 20, boxShadow: '0 12px 40px rgba(15,23,42,0.08)' }}>

        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg, #2563eb, #6366f1)',
              color: 'white', fontWeight: 700, fontSize: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {initial}
            </div>
            <div>
              <strong style={{ fontSize: 20, display: 'block', lineHeight: 1.2 }}>{c.name}</strong>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>{c.contact}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {callStatusBadge()}
            {conversionBadge()}
            {certificationBadge()}
            {categoryBadge()}
          </div>
        </div>

        {/* Timeline pills */}
        <ContactTimeline contact={c} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button
            onClick={() => setShowEditModal(true)}
            style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', fontWeight: 600, cursor: 'pointer', background: '#2563eb', color: 'white', fontSize: 14 }}
          >
            Appeler le contact
          </button>
          <button
            onClick={handleViewConversation}
            style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', fontWeight: 600, cursor: 'pointer', background: '#f3f4f6', color: '#111827', fontSize: 14 }}
          >
            Voir la conversation
          </button>
          <button
            style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', fontWeight: 600, cursor: 'pointer', background: '#f3f4f6', color: '#111827', fontSize: 14 }}
          >
            Archiver
          </button>
        </div>

        {/* Synthèse IA dossier */}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => void handleSynthesizeDossier()}
            disabled={loadingDossier}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid #e9d5ff', background: '#faf5ff', color: '#7c3aed', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: loadingDossier ? 0.6 : 1, width: '100%', justifyContent: 'center' }}
          >
            {loadingDossier
              ? <div style={{ width: 14, height: 14, border: '2px solid #a855f7', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              : <Sparkles style={{ width: 14, height: 14 }} />}
            Synthèse IA du dossier client
          </button>

          {dossierSynthesis && (
            <div style={{ marginTop: 10, padding: 14, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles style={{ width: 12, height: 12 }} /> Synthèse IA
                </p>
                <span style={{
                  padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: dossierSynthesis.risk_level === 'élevé' ? '#fee2e2' : dossierSynthesis.risk_level === 'moyen' ? '#fef9c3' : '#dcfce7',
                  color:      dossierSynthesis.risk_level === 'élevé' ? '#dc2626' : dossierSynthesis.risk_level === 'moyen' ? '#ca8a04' : '#16a34a',
                }}>
                  Risque {dossierSynthesis.risk_level}
                </span>
              </div>
              <p style={{ margin: '0 0 6px', fontSize: 13, color: '#374151' }}>{dossierSynthesis.summary}</p>
              {dossierSynthesis.parcours_description && (
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b7280' }}>{dossierSynthesis.parcours_description}</p>
              )}
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>
                Prochaine action : {dossierSynthesis.next_action_suggested}
              </p>
              {dossierSynthesis.key_signals.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {dossierSynthesis.key_signals.map((s, i) => (
                    <span key={i} style={{ padding: '2px 8px', background: '#ede9fe', color: '#6d28d9', borderRadius: 20, fontSize: 11 }}>{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Infos 2 colonnes */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 18, marginTop: 20, background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb' }}>
          {/* Colonne gauche */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 14 }}>
            <InfoRow label="Conversion"  value={c.conversion_status ?? '—'} />
            <InfoRow label="Source"      value={c.source ?? '—'} />
            <InfoRow label="Chat ID"     value={c.chat_id} mono />
            <InfoRow label="Statut actif" value={c.is_active ? 'Oui' : 'Non'} color={c.is_active ? '#059669' : '#dc2626'} />
            <InfoRow label="Notes"       value={c.call_notes ?? '—'} />
          </div>

          {/* Colonne droite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 14 }}>
            <InfoRow label="Dernière mise à jour" value={formatDate(c.updatedAt)} />
            <InfoRow label="Total messages"       value={String(c.total_messages ?? 0)} />
            <InfoRow label="Appels"               value={String(c.call_count)} />
            <InfoRow label="Dernier appel"        value={c.last_call_date ? formatRelativeDate(c.last_call_date) : '—'} />
            <InfoRow label="Priorité"             value={c.priority ?? 'moyenne'} capitalize />
          </div>
        </div>
      </div>

      {/* ── Parrainage & ERP ── */}
      {(c.referral_code || c.order_client_id) && (
        <div style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb', marginTop: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#111827' }}>Intégration ERP</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
            {c.order_client_id != null && (
              <InfoRow label="ID client ERP" value={String(c.order_client_id)} mono />
            )}
            {c.referral_code && (
              <InfoRow label="Code parrainage" value={c.referral_code} mono />
            )}
            {c.referral_count != null && (
              <InfoRow label="Filleuls" value={String(c.referral_count)} />
            )}
            {c.referral_commission != null && (
              <InfoRow label="Commission" value={`${c.referral_commission} FCFA`} />
            )}
            {c.certified_at && (
              <InfoRow label="Certifié le" value={formatDateShort(c.certified_at)} />
            )}
          </div>
        </div>
      )}

      {/* ── Champs CRM ── */}
      {crmFields.length > 0 && (
        <div style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb', marginTop: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#111827' }}>Champs CRM</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {crmFields.map((entry) => {
              const key = entry.definition.field_key;
              const isEditing = editingField === key;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ width: 140, flexShrink: 0 }}>
                    <strong style={{ fontSize: 13, color: '#374151' }}>{entry.definition.name}</strong>
                    {entry.definition.required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
                  </div>
                  {isEditing ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {entry.definition.field_type === 'boolean' ? (
                        <select
                          value={editValue === true ? 'true' : 'false'}
                          onChange={e => setEditValue(e.target.value === 'true')}
                          style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                        >
                          <option value="true">Oui</option>
                          <option value="false">Non</option>
                        </select>
                      ) : entry.definition.field_type === 'select' ? (
                        <select
                          value={editValue as string}
                          onChange={e => setEditValue(e.target.value)}
                          style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                        >
                          <option value="">—</option>
                          {(entry.definition.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : entry.definition.field_type === 'multiselect' ? (
                        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {(entry.definition.options ?? []).map(o => {
                            const sel = Array.isArray(editValue) && (editValue as string[]).includes(o);
                            return (
                              <button key={o}
                                onClick={() => {
                                  const cur = Array.isArray(editValue) ? (editValue as string[]) : [];
                                  setEditValue(sel ? cur.filter(x => x !== o) : [...cur, o]);
                                }}
                                style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, border: '1px solid', cursor: 'pointer',
                                  background: sel ? '#2563eb' : '#f3f4f6', color: sel ? 'white' : '#374151', borderColor: sel ? '#2563eb' : '#d1d5db' }}>
                                {o}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <input
                          type={entry.definition.field_type === 'number' ? 'number' : entry.definition.field_type === 'date' ? 'date' : 'text'}
                          value={editValue as string}
                          onChange={e => setEditValue(entry.definition.field_type === 'number' ? Number(e.target.value) : e.target.value)}
                          style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                        />
                      )}
                      <button onClick={() => saveField(entry)} disabled={crmSaving} style={{ padding: '4px 8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        <Check style={{ width: 14, height: 14 }} />
                      </button>
                      <button onClick={() => setEditingField(null)} style={{ padding: '4px 8px', background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        <XIcon style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: getCrmDisplayValue(entry) === '—' ? '#9ca3af' : '#111827' }}>
                        {getCrmDisplayValue(entry)}
                      </span>
                      <button onClick={() => startEditField(entry)}
                        style={{ padding: '3px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                        <Edit2 style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Historique ── */}
      <div style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb', marginTop: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 700, color: '#111827' }}>Historique</h3>

        {recentMessages.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>
            Aucun message enregistré
          </p>
        ) : (
          recentMessages.map((msg) => (
            <div
              key={msg.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e5e7eb' }}
            >
              <span style={{ fontSize: 14, color: '#111827' }}>
                {msg.from_me ? '💬' : '📩'}{' '}
                {msg.from_me ? 'Message sortant' : 'Message entrant'}
                {msg.text ? ` — ${msg.text.slice(0, 45)}${msg.text.length > 45 ? '…' : ''}` : ' [Média]'}
              </span>
              <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0, marginLeft: 16, whiteSpace: 'nowrap' }}>
                {formatTime(msg.timestamp)} · {formatDateShort(msg.timestamp)}
              </span>
            </div>
          ))
        )}

        {/* Ligne supplémentaire : prochain appel si défini */}
        {c.next_call_date && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
            <span style={{ fontSize: 14, color: '#111827' }}>
              📞 Prochain appel planifié
            </span>
            <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0, marginLeft: 16, whiteSpace: 'nowrap' }}>
              {formatDate(c.next_call_date)}
            </span>
          </div>
        )}
      </div>

      {/* ── Historique des appels (F-03) ── */}
      <CallLogHistory />

      {/* ── Relances ── */}
      <div style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Relances</h3>
          <button
            onClick={() => setShowFollowUpModal(true)}
            style={{ fontSize: 12, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
          >
            + Planifier
          </button>
        </div>
        {contactFollowUps.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>Aucune relance planifiée</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contactFollowUps.slice(0, 5).map((fu) => {
              const sc = FOLLOWUP_STATUS_COLORS[fu.status];
              return (
                <div key={fu.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ background: sc.bg, color: sc.text, borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '2px 8px', flexShrink: 0 }}>
                    {FOLLOWUP_STATUS_LABELS[fu.status]}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{FOLLOW_UP_TYPE_LABELS[fu.type]}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{formatDateShort(fu.scheduled_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. Score d'engagement ── */}
      {(() => {
        const level =
          engagementScore >= 76 ? { label: 'Très chaud 🚀', color: '#ef4444', bg: '#fef2f2' } :
          engagementScore >= 51 ? { label: 'Chaud 🔥',      color: '#f97316', bg: '#fff7ed' } :
          engagementScore >= 26 ? { label: 'Tiède 🌡️',      color: '#eab308', bg: '#fefce8' } :
                                  { label: 'Froid ❄️',       color: '#3b82f6', bg: '#eff6ff' };
        return (
          <div style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb', marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Score d&apos;engagement</h3>
              <span style={{ background: level.bg, color: level.color, borderRadius: 999, fontSize: 12, fontWeight: 700, padding: '4px 12px' }}>
                {level.label}
              </span>
            </div>
            {/* Barre de progression */}
            <div style={{ background: '#f3f4f6', borderRadius: 999, height: 10, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ width: `${engagementScore}%`, height: '100%', background: level.color, borderRadius: 999, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af' }}>
              <span>0</span>
              <span style={{ fontWeight: 600, color: level.color }}>{engagementScore} / 100</span>
              <span>100</span>
            </div>
            {/* Détail des composantes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 14 }}>
              {[
                { label: 'Appels',    value: Math.min((selectedContact!.call_count ?? 0) * 5, 25), max: 25 },
                { label: 'Messages',  value: Math.min(selectedContact!.total_messages ?? 0, 25),  max: 25 },
                { label: 'Récence',   value: (() => {
                  if (!selectedContact!.last_call_date) return 0;
                  const d = (Date.now() - new Date(selectedContact!.last_call_date).getTime()) / 86400000;
                  return d <= 7 ? 25 : d <= 30 ? 15 : d <= 90 ? 5 : 0;
                })(), max: 25 },
                { label: 'Conversion', value: ({ nouveau: 0, prospect: 10, client: 25, perdu: 0 } as Record<string,number>)[selectedContact!.conversion_status ?? 'nouveau'] ?? 0, max: 25 },
              ].map(({ label, value, max }) => (
                <div key={label} style={{ background: '#f9fafb', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#9ca3af' }}>{label}</p>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#111827' }}>{value}<span style={{ fontSize: 10, color: '#9ca3af' }}>/{max}</span></p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 4. Aperçu conversation ── */}
      <div style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Aperçu conversation</h3>
          <button
            onClick={handleViewConversation}
            style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
          >
            Voir tout →
          </button>
        </div>

        {recentMessages.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Aucun message</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...recentMessages].reverse().map((msg) => (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.from_me ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '70%',
                  background: msg.from_me ? '#16a34a' : '#f3f4f6',
                  color: msg.from_me ? 'white' : '#111827',
                  borderRadius: msg.from_me ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '8px 12px',
                  fontSize: 13,
                }}>
                  <p style={{ margin: '0 0 2px', lineHeight: 1.4 }}>
                    {msg.text || '[Média]'}
                  </p>
                  <p style={{ margin: 0, fontSize: 10, opacity: 0.65, textAlign: 'right' }}>
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 5. Médias partagés ── */}
      {sharedMedias.length > 0 && (
        <div style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb', marginTop: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#111827' }}>Médias partagés</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {sharedMedias.map((med, i) => {
              if (med.type === 'image' && med.url) {
                return (
                  <a key={i} href={med.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: '#f3f4f6' }}>
                    <img src={med.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  </a>
                );
              }
              if (med.type === 'document') {
                return (
                  <a key={i} href={med.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', borderRadius: 10, background: '#f3f4f6', textDecoration: 'none', gap: 4, padding: 8 }}>
                    <span style={{ fontSize: 22 }}>📄</span>
                    <span style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                      {med.file_name ?? 'Doc'}
                    </span>
                  </a>
                );
              }
              if (med.type === 'audio' || med.type === 'voice') {
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', borderRadius: 10, background: '#f0fdf4' }}>
                    <span style={{ fontSize: 22 }}>🎤</span>
                    <span style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Vocal</span>
                  </div>
                );
              }
              if (med.type === 'video') {
                return (
                  <a key={i} href={med.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', borderRadius: 10, background: '#eff6ff', textDecoration: 'none' }}>
                    <span style={{ fontSize: 22 }}>🎬</span>
                    <span style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Vidéo</span>
                  </a>
                );
              }
              return null;
            })}
          </div>
        </div>
      )}

      {/* ── 7. Contacts similaires ── */}
      {similarContacts.length > 0 && (
        <div style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb', marginTop: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#111827' }}>Contacts similaires</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {similarContacts.map((other) => {
              const sharedTags = (selectedContact!.tags ?? []).filter((t) => other.tags?.includes(t));
              const sameSource = selectedContact!.source && other.source === selectedContact!.source;
              const statusColors: Record<string, { bg: string; text: string }> = {
                appelé:        { bg: '#ecfdf5', text: '#059669' },
                à_appeler:     { bg: '#eff6ff', text: '#2563eb' },
                rappeler:      { bg: '#fff7ed', text: '#ea580c' },
                non_joignable: { bg: '#f9fafb', text: '#6b7280' },
              };
              const sc = statusColors[other.call_status] ?? statusColors['à_appeler'];
              return (
                <div
                  key={other.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: '#dcfce7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, color: '#16a34a', flexShrink: 0,
                  }}>
                    {other.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{other.name}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
                      {sameSource && `Source : ${other.source}`}
                      {sameSource && sharedTags.length > 0 && ' · '}
                      {sharedTags.length > 0 && `Tags : ${sharedTags.join(', ')}`}
                    </p>
                  </div>
                  <span style={{ background: sc.bg, color: sc.text, borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '3px 8px', flexShrink: 0 }}>
                    {getCallStatusLabel(other.call_status)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal appel */}
      {showEditModal && (
        <EditModal
          name={c.name}
          phone={c.contact}
          currentStatus={c.call_status}
          currentNotes={c.call_notes ?? ''}
          onClose={() => setShowEditModal(false)}
          onConfirm={(status, notes, outcome, durationSec) =>
            handleConfirmEdit(status, notes, outcome, durationSec)
          }
        />
      )}

      {/* Modal relance */}
      {showFollowUpModal && (
        <CreateFollowUpModal
          contactId={selectedContact?.id}
          onClose={() => setShowFollowUpModal(false)}
          onCreated={() => selectedContact?.id && void loadFollowUps(selectedContact.id)}
        />
      )}
    </div>
  );
}

// ─── Sous-composant ligne d'info ─────────────────────────────────────────────

function InfoRow({ label, value, mono, color, capitalize }: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <strong style={{ display: 'block', marginBottom: 2, color: '#111827' }}>{label}</strong>
      <p style={{
        margin: 0,
        color: color ?? '#6b7280',
        fontFamily: mono ? 'monospace' : undefined,
        fontSize: mono ? 11 : 13,
        textTransform: capitalize ? 'capitalize' : undefined,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value}
      </p>
    </div>
  );
}
