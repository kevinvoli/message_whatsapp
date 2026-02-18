'use client';

// Données provenant du backend via WebSocket (useContactStore)

import React, { useMemo, useState } from 'react';
import {
  Phone,
  PhoneCall,
  Clock,
  MessageSquare,
  PhoneMissed,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useContactStore } from '@/store/contactStore';
import { useChatStore } from '@/store/chatStore';
import { CallStatus, getCallStatusColor, getCallStatusLabel } from '@/types/chat';
import { formatDate, formatDateShort, formatTime, formatRelativeDate } from '@/lib/dateUtils';
import { ContactTimeline } from './ContactTimeline';
import { updateContactCallStatus } from '@/lib/contactApi';
import { logger } from '@/lib/logger';

// ─── Modal modification ───────────────────────────────────────────────────────

interface EditModalProps {
  name: string;
  phone: string;
  currentStatus: CallStatus;
  currentNotes: string;
  onClose: () => void;
  onConfirm: (status: CallStatus, notes: string) => void;
}

function EditModal({ name, phone, currentStatus, currentNotes, onClose, onConfirm }: EditModalProps) {
  const [status, setStatus] = useState<CallStatus>(currentStatus);
  const [notes,  setNotes]  = useState(currentNotes);

  const opts: { value: CallStatus; label: string; icon: React.ReactNode }[] = [
    { value: 'appelé',        label: 'Appelé',        icon: <PhoneCall  className="w-4 h-4" /> },
    { value: 'rappeler',      label: 'À rappeler',    icon: <Clock      className="w-4 h-4" /> },
    { value: 'non_joignable', label: 'Non joignable', icon: <PhoneMissed className="w-4 h-4" /> },
    { value: 'à_appeler',     label: 'À appeler',     icon: <Phone      className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Modifier le contact</h3>
        <p className="text-sm text-gray-500 mb-5">{name} · {phone}</p>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Statut d&apos;appel
        </p>
        <div className="grid grid-cols-2 gap-2 mb-5">
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
          <button onClick={() => onConfirm(status, notes)} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Vue détail (fidèle au mockup) ───────────────────────────────────────────

export function ContactDetailView() {
  const router = useRouter();
  const { selectedContact, upsertContact, contacts: allContacts } = useContactStore();
  const { selectConversation } = useChatStore();
  const [showEditModal, setShowEditModal] = useState(false);

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

  function handleViewConversation() {
    if (!selectedContact?.chat_id) return;
    selectConversation(selectedContact.chat_id);
    router.push('/whatsapp');
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

      {/* Modal */}
      {showEditModal && (
        <EditModal
          name={c.name}
          phone={c.contact}
          currentStatus={c.call_status}
          currentNotes={c.call_notes ?? ''}
          onClose={() => setShowEditModal(false)}
          onConfirm={handleConfirmEdit}
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
