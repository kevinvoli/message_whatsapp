'use client';

import React, { useState } from 'react';
import { X, CheckCircle, Sparkles } from 'lucide-react';
import {
  ConversationResult,
  CONVERSATION_RESULT_LABELS,
  CONVERSATION_RESULT_COLORS,
} from '@/types/chat';
import { setConversationOutcome } from '@/lib/followUpApi';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface AiQualification {
  suggested_outcome: string;
  follow_up_needed: boolean;
  follow_up_date: string | null;
  interest_level: 'faible' | 'moyen' | 'fort';
  main_objection: string | null;
  products_mentioned: string[];
}

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

const INTEREST_LABELS: Record<string, string> = {
  faible: 'Intérêt faible',
  moyen: 'Intérêt moyen',
  fort: 'Intérêt fort',
};
const INTEREST_COLORS: Record<string, string> = {
  faible: 'bg-red-100 text-red-700',
  moyen: 'bg-yellow-100 text-yellow-700',
  fort: 'bg-green-100 text-green-700',
};

export default function ConversationOutcomeModal({
  conversationId,
  currentResult,
  onClose,
  onSaved,
}: Props) {
  const [selected, setSelected] = useState<ConversationResult | null>(currentResult ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AiQualification | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const handleAiQualify = async () => {
    setLoadingAi(true);
    try {
      const res = await fetch(`${API_URL}/ai/qualify/${conversationId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json() as AiQualification;
        setAiSuggestion(data);
        if (data.suggested_outcome && ALL_RESULTS.includes(data.suggested_outcome as ConversationResult)) {
          setSelected(data.suggested_outcome as ConversationResult);
        }
      }
    } catch { /* silencieux */ }
    finally { setLoadingAi(false); }
  };

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleAiQualify()}
              disabled={loadingAi}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
              title="Qualification assistée par IA"
            >
              {loadingAi
                ? <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                : <Sparkles className="w-3 h-3" />}
              Qualifier avec IA
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Suggestion IA */}
        {aiSuggestion && (
          <div className="mx-5 mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs space-y-1.5">
            <p className="font-semibold text-purple-700 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Analyse IA</p>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-0.5 rounded-full font-medium ${INTEREST_COLORS[aiSuggestion.interest_level]}`}>
                {INTEREST_LABELS[aiSuggestion.interest_level]}
              </span>
              {aiSuggestion.follow_up_needed && aiSuggestion.follow_up_date && (
                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                  Relance : {new Date(aiSuggestion.follow_up_date).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>
            {aiSuggestion.main_objection && (
              <p className="text-purple-600">Objection : {aiSuggestion.main_objection}</p>
            )}
            {aiSuggestion.products_mentioned.length > 0 && (
              <p className="text-purple-600">Produits : {aiSuggestion.products_mentioned.join(', ')}</p>
            )}
          </div>
        )}

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
