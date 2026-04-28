'use client';

import React, { useState } from 'react';
import { Bell, XCircle, CheckCircle } from 'lucide-react';
import { FollowUpType, FOLLOW_UP_TYPE_LABELS } from '@/types/chat';
import { createFollowUp } from '@/lib/followUpApi';

interface CreateFollowUpModalProps {
  contactId?: string;
  conversationId?: string;
  defaultType?: FollowUpType;
  onClose: () => void;
  onDone: () => void;
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

  async function handleSave() {
    if (!date) { setError('Veuillez choisir une date.'); return; }
    setSaving(true);
    setError(null);
    try {
      await createFollowUp({
        contact_id:      contactId,
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
