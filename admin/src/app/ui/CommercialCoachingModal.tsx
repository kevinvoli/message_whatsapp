"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { X, Brain, CheckCircle, AlertTriangle, Lightbulb, RefreshCw, ChevronDown } from 'lucide-react';
import { PerformanceCommercial, QualityCoachingResult, WhatsappChat } from '@/app/lib/definitions';
import { analyzeConversationQuality } from '@/app/lib/api/ai-governance.api';
import { getChats } from '@/app/lib/api/conversations.api';
import { formatRelativeDate } from '@/app/lib/dateUtils';
import { logger } from '@/app/lib/logger';

interface CommercialCoachingModalProps {
  commercial: PerformanceCommercial;
  onClose: () => void;
}

export function CommercialCoachingModal({ commercial, onClose }: CommercialCoachingModalProps) {
  const [conversations, setConversations] = useState<WhatsappChat[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string>('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [result, setResult] = useState<QualityCoachingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setConversationsLoading(true);
    setError(null);
    try {
      const data = await getChats(20, 0, 'month', undefined, commercial.id);
      setConversations(data.data);
      if (data.data.length > 0) {
        setSelectedChatId(data.data[0].chat_id);
      }
    } catch (err) {
      logger.error('Erreur chargement conversations coaching', { error: err instanceof Error ? err.message : String(err) });
      setError('Impossible de charger les conversations.');
    } finally {
      setConversationsLoading(false);
    }
  }, [commercial.id]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const handleAnalyze = async () => {
    if (!selectedChatId) return;
    setAnalysisLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await analyzeConversationQuality(selectedChatId);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse échouée.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-500';
  };

  const scoreBarColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-400';
    return 'bg-red-500';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-60 p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Coaching IA</h2>
              <p className="text-xs text-gray-500">{commercial.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le modal"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Sélecteur de conversation */}
          <div className="space-y-2">
            <label htmlFor="coaching-chat-select" className="block text-sm font-medium text-gray-700">
              Conversation à analyser
            </label>
            {conversationsLoading ? (
              <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
            ) : conversations.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                Aucune conversation disponible pour ce commercial sur les 30 derniers jours.
              </p>
            ) : (
              <div className="relative">
                <select
                  id="coaching-chat-select"
                  value={selectedChatId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    setSelectedChatId(e.target.value);
                    setResult(null);
                    setError(null);
                  }}
                  className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-9 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {conversations.map((c) => (
                    <option key={c.chat_id} value={c.chat_id}>
                      {c.name || c.contact_client} — {formatRelativeDate(c.last_activity_at)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>

          {/* Bouton analyser */}
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={!selectedChatId || analysisLoading || conversationsLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {analysisLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analyse en cours…
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                Analyser la qualité
              </>
            )}
          </button>

          {/* Erreur */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Résultats */}
          {result && (
            <div className="space-y-4">
              {/* Score */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Score qualité</span>
                  <span className={`text-2xl font-bold ${scoreColor(result.quality_score)}`}>
                    {result.quality_score}<span className="text-sm font-normal text-gray-400">/100</span>
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className={`${scoreBarColor(result.quality_score)} h-2.5 rounded-full transition-all duration-500`}
                    style={{ width: `${result.quality_score}%` }}
                  />
                </div>
              </div>

              {/* Points forts */}
              {result.strengths.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <h3 className="text-sm font-semibold text-green-700">Points forts</h3>
                  </div>
                  <ul className="space-y-1.5 pl-6">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-green-500 flex-shrink-0">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Points à améliorer */}
              {result.improvements.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    <h3 className="text-sm font-semibold text-orange-600">Axes d&apos;amélioration</h3>
                  </div>
                  <ul className="space-y-1.5 pl-6">
                    {result.improvements.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-orange-400 flex-shrink-0">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Conseils de coaching */}
              {result.coaching_tips.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold text-blue-600">Conseils de coaching</h3>
                  </div>
                  <ul className="space-y-1.5 pl-6">
                    {result.coaching_tips.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-blue-400 flex-shrink-0">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
