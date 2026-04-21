'use client';

import React, { useState } from 'react';
import { X, Bell, Sparkles } from 'lucide-react';
import { FollowUpType, FOLLOW_UP_TYPE_LABELS } from '@/types/chat';
import { createFollowUp } from '@/lib/followUpApi';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface Props {
  contactId?: string;
  conversationId?: string;
  contactName?: string;
  onClose: () => void;
  onCreated?: () => void;
}

const ALL_TYPES: FollowUpType[] = [
  'rappel',
  'relance_post_conversation',
  'relance_sans_commande',
  'relance_post_annulation',
  'relance_fidelisation',
  'relance_sans_reponse',
];

function todayPlusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 16);
}

export default function CreateFollowUpModal({ contactId, conversationId, contactName, onClose, onCreated }: Props) {
  const [type, setType] = useState<FollowUpType>('rappel');
  const [scheduledAt, setScheduledAt] = useState(todayPlusDays(1));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);

  const handleGenerateAiMessage = async () => {
    setLoadingAi(true);
    try {
      const res = await fetch(`${API_URL}/ai/followup-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ followUpType: type, contactName }),
      });
      if (res.ok) {
        const data = await res.json() as { message: string };
        if (data.message) setAiMessage(data.message);
      }
    } catch { /* silencieux */ }
    finally { setLoadingAi(false); }
  };

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await createFollowUp({
        contact_id: contactId,
        conversation_id: conversationId,
        type,
        scheduled_at: new Date(scheduledAt).toISOString(),
        notes: notes.trim() || undefined,
      });
      onCreated?.();
      onClose();
    } catch {
      setError('Erreur lors de la création. Réessayez.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Planifier une relance</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type de relance</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FollowUpType)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>{FOLLOW_UP_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date et heure</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Notes / Message (optionnel)</label>
              <button
                type="button"
                onClick={() => void handleGenerateAiMessage()}
                disabled={loadingAi}
                className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50"
                title="Générer un message de relance avec l'IA"
              >
                {loadingAi
                  ? <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  : <Sparkles className="w-3 h-3" />}
                Générer avec IA
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Raison de la relance, contexte…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
            />
            {aiMessage && (
              <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-xs text-purple-700 font-medium mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Suggestion IA</p>
                <p className="text-xs text-gray-700 mb-2">{aiMessage}</p>
                <button
                  type="button"
                  onClick={() => { setNotes(aiMessage); setAiMessage(''); }}
                  className="text-xs text-purple-600 hover:underline"
                >
                  Utiliser ce message
                </button>
              </div>
            )}
          </div>
        </div>

        {error && <p className="px-5 text-xs text-red-600">{error}</p>}

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Bell className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Planifier'}
          </button>
        </div>
      </div>
    </div>
  );
}
