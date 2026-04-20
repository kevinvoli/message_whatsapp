'use client';

import React, { useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import {
  ConversationResult,
  CONVERSATION_RESULT_LABELS,
  CONVERSATION_RESULT_COLORS,
} from '@/types/chat';
import { setConversationOutcome } from '@/lib/followUpApi';

interface Props {
  conversationId: string;
  currentResult?: ConversationResult | null;
  onClose: () => void;
  onSaved: (result: ConversationResult) => void;
}

const ALL_RESULTS: ConversationResult[] = [
  'commande_confirmee',
  'commande_a_saisir',
  'a_relancer',
  'rappel_programme',
  'pas_interesse',
  'sans_reponse',
  'infos_incompletes',
  'deja_client',
  'annule',
];

export default function ConversationOutcomeModal({
  conversationId,
  currentResult,
  onClose,
  onSaved,
}: Props) {
  const [selected, setSelected] = useState<ConversationResult | null>(currentResult ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await setConversationOutcome(conversationId, selected);
      onSaved(selected);
      onClose();
    } catch {
      setError('Erreur lors de la sauvegarde. Réessayez.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Qualifier la conversation</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Grille de résultats */}
        <div className="px-5 py-4 grid grid-cols-1 gap-2">
          {ALL_RESULTS.map((result) => {
            const isSelected = selected === result;
            return (
              <button
                key={result}
                onClick={() => setSelected(result)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium text-left transition-all ${
                  isSelected
                    ? 'border-green-500 bg-green-50 text-green-800'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    isSelected ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
                <span className={`px-2 py-0.5 rounded-full text-xs ${CONVERSATION_RESULT_COLORS[result]}`}>
                  {CONVERSATION_RESULT_LABELS[result]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
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
            disabled={!selected || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
