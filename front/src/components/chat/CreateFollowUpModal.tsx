'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bell, XCircle, CheckCircle, User } from 'lucide-react';
import { FollowUpType, FOLLOW_UP_TYPE_LABELS } from '@/types/chat';
import { createFollowUp } from '@/lib/followUpApi';
import { searchClients } from '@/lib/contactApi';
import { useChatStore } from '@/store/chatStore';

interface CreateFollowUpModalProps {
  contactId?: string;
  conversationId?: string;
  defaultType?: FollowUpType;
  onClose: () => void;
  onDone: () => void;
}

interface ContactPick {
  id: string;
  name: string;
  phone: string;
}

const TYPES: FollowUpType[] = [
  'rappel',
  'relance_post_conversation',
  'relance_sans_commande',
  'relance_post_annulation',
  'relance_fidelisation',
  'relance_sans_reponse',
];

export default function CreateFollowUpModal({
  contactId,
  conversationId,
  defaultType,
  onClose,
  onDone,
}: CreateFollowUpModalProps) {
  const [type, setType] = useState<FollowUpType>(defaultType ?? 'rappel');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversations = useChatStore((s) => s.conversations);

  const contextContact = useMemo<ContactPick | null>(() => {
    if (!contactId && !conversationId) return null;
    const conv = conversations.find(
      (c) => (conversationId && c.id === conversationId) || (contactId && c.contact_summary?.id === contactId),
    );
    if (!conv) return null;
    return {
      id: conv.contact_summary?.id ?? contactId ?? '',
      name: conv.clientName,
      phone: conv.clientPhone,
    };
  }, [contactId, conversationId, conversations]);

  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactPick[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactPick | null>(null);
  const [searching, setSearching] = useState(false);

  const hasContext = Boolean(contactId || conversationId);

  useEffect(() => {
    if (hasContext) return;
    if (!contactSearch || contactSearch.length < 2) {
      setContactResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchClients({ search: contactSearch, limit: 5 });
        setContactResults(res.data.map((c) => ({ id: c.id, name: c.name, phone: c.phone })));
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [contactSearch, hasContext]);

  async function handleSave() {
    if (!date) {
      setError('Veuillez choisir une date.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createFollowUp({
        contact_id:      selectedContact?.id ?? contactId,
        conversation_id: conversationId,
        type,
        scheduled_at:    new Date(date).toISOString(),
        notes:           notes || undefined,
      });
      onDone();
      onClose();
    } catch {
      setError('Erreur lors de la création de la relance.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-green-600" />
            <h2 className="text-base font-semibold text-gray-900">Nouvelle relance</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {hasContext && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600 flex-shrink-0" />
              {contextContact ? (
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{contextContact.name}</p>
                  {contextContact.phone && (
                    <p className="text-xs text-gray-500 truncate">{contextContact.phone}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-700">Relance liée à la conversation actuelle</p>
              )}
            </div>
          )}

          {!hasContext && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Client (optionnel)
              </label>
              {selectedContact ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{selectedContact.name}</p>
                    <p className="text-xs text-gray-500 truncate">{selectedContact.phone}</p>
                  </div>
                  <button
                    onClick={() => { setSelectedContact(null); setContactSearch(''); }}
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Rechercher un client…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                  )}
                  {contactResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      {contactResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedContact(c); setContactSearch(''); setContactResults([]); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                        >
                          <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                          <p className="text-xs text-gray-500 truncate">{c.phone}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type de relance</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FollowUpType)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{FOLLOW_UP_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date et heure</label>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ex: Rappeler pour devis produit X…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Planifier'}
          </button>
        </div>
      </div>
    </div>
  );
}
