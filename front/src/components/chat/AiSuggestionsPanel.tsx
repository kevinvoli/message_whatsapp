'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { getAiSuggestions } from '@/lib/aiApi';
import { ReplySuggestion } from '@/types/ai';

interface AiSuggestionsPanelProps {
  chatId: string;
  onSelect: (text: string) => void;
  visible: boolean;
  onClose: () => void;
}

export function AiSuggestionsPanel({ chatId, onSelect, visible, onClose }: AiSuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAiSuggestions(chatId);
      setSuggestions(data);
    } catch {
      // silencieux — IA désactivée ou indisponible
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    if (visible && chatId) {
      void fetchSuggestions();
    }
  }, [visible, chatId, fetchSuggestions]);

  if (!visible) return null;

  return (
    <div className="mb-2 p-2 bg-purple-50 border border-purple-200 rounded-xl">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-purple-700 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" />
          Suggestions IA
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void fetchSuggestions()}
            disabled={loading}
            title="Rafraîchir les suggestions"
            className="text-purple-400 hover:text-purple-600 disabled:opacity-50 p-0.5 rounded"
            aria-label="Rafraîchir les suggestions IA"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-purple-400 hover:text-purple-600 p-0.5 rounded"
            aria-label="Fermer les suggestions IA"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-1">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-purple-500">Génération en cours…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {suggestions.length === 0 ? (
            <p className="text-xs text-purple-400 py-1">Aucune suggestion disponible.</p>
          ) : (
            suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onSelect(suggestion.text)}
                title={suggestion.rationale}
                className="text-left text-xs px-2.5 py-1.5 bg-white border border-purple-200 rounded-lg hover:bg-purple-100 text-gray-700 truncate"
                aria-label={`Suggestion IA : ${suggestion.text}`}
              >
                {suggestion.text}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
