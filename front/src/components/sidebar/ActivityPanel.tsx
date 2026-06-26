'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  MessageSquareText,
  CheckCheck,
  Activity,
  Clock,
  RefreshCw,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { CommercialStatsDto } from '@/types/chat';
import { getCommercialStats, getQuizPdfs, getQuizHistory } from '@/lib/api';
import type { QuizPdf, QuizHistoryEntry } from '@/lib/definitions';
import { formatRelativeDate, formatDate } from '@/lib/dateUtils';
import { logger } from '@/lib/logger';
import { PdfItem } from '@/components/quiz/PdfItem';

type Periode = 'today' | 'week' | 'month';

const PERIODES: { key: Periode; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week',  label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];

interface ActivityPanelProps {
  commercialId: string;
}

const ActivityPanel: React.FC<ActivityPanelProps> = ({ commercialId }) => {
  const [stats, setStats] = useState<CommercialStatsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periode, setPeriode] = useState<Periode>('today');

  const [pdfs, setPdfs] = useState<QuizPdf[]>([]);
  const [loadingPdfs, setLoadingPdfs] = useState(true);
  const [errorPdfs, setErrorPdfs] = useState<string | null>(null);

  const [history, setHistory] = useState<QuizHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [errorHistory, setErrorHistory] = useState<string | null>(null);

  const fetchStats = useCallback(async (p: Periode) => {
    if (!commercialId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCommercialStats(commercialId, p);
      setStats(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      logger.error('Impossible de charger les stats du commercial', { error: message });
      setError('Impossible de charger les statistiques.');
    } finally {
      setLoading(false);
    }
  }, [commercialId]);

  useEffect(() => {
    void fetchStats(periode);
  }, [fetchStats, periode]);

  useEffect(() => {
    setLoadingPdfs(true);
    setErrorPdfs(null);
    getQuizPdfs()
      .then((data) => setPdfs(data))
      .catch(() => setErrorPdfs('Impossible de charger les documents.'))
      .finally(() => setLoadingPdfs(false));
  }, []);

  useEffect(() => {
    setLoadingHistory(true);
    setErrorHistory(null);
    getQuizHistory()
      .then((data) => setHistory(data))
      .catch(() => setErrorHistory("Impossible de charger l'historique."))
      .finally(() => setLoadingHistory(false));
  }, []);

  const formatMinutes = (min: number): string => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* En-tete */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Mon activite
        </h3>
        <button
          onClick={() => void fetchStats(periode)}
          disabled={loading}
          aria-label="Rafraichir les statistiques"
          className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filtre periode */}
      <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 gap-0.5">
        {PERIODES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriode(key)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
              periode === key
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Erreur stats */}
      {error && (
        <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{error}</p>
      )}

      {/* Chargement initial stats */}
      {loading && !stats && (
        <div className="flex justify-center py-6">
          <div className="animate-spin w-6 h-6 rounded-full border-2 border-green-600 border-t-transparent" />
        </div>
      )}

      {/* Stats */}
      {stats && (
        <>
          {/* Statut en ligne */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
            {stats.isOnline ? (
              <Wifi className="w-4 h-4 text-green-500 flex-shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 text-gray-400 flex-shrink-0" />
            )}
            <span className="text-sm text-gray-700">
              {stats.isOnline ? 'En ligne' : 'Hors ligne'}
            </span>
          </div>

          {/* Grille metriques */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-blue-600">
                <MessageSquareText className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs font-medium truncate">Messages recus</span>
              </div>
              <p className="text-2xl font-bold text-blue-800">{stats.messagesRead}</p>
            </div>

            <div className="bg-green-50 rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-green-600">
                <CheckCheck className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs font-medium truncate">Traites</span>
              </div>
              <p className="text-2xl font-bold text-green-800">{stats.messagesHandled}</p>
            </div>

            <div className="bg-purple-50 rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-purple-600">
                <Activity className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs font-medium truncate">Conversations</span>
              </div>
              <p className="text-2xl font-bold text-purple-800">{stats.activeConversations}</p>
            </div>

            <div className="bg-orange-50 rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-orange-600">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs font-medium truncate">Derniere act.</span>
              </div>
              <p className="text-sm font-semibold text-orange-800 leading-tight">
                {formatRelativeDate(stats.lastActivityAt)}
              </p>
            </div>
          </div>

          {/* Temps de connexion */}
          {stats.totalConnectionMinutes != null && (
            <div className="bg-indigo-50 rounded-lg p-3 flex items-center gap-3">
              <Timer className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <div>
                <span className="text-xs font-medium text-indigo-700">Temps de connexion</span>
                <p className="text-xl font-bold text-indigo-800">
                  {formatMinutes(stats.totalConnectionMinutes)}
                </p>
              </div>
            </div>
          )}

          {/* Taux de reponse */}
          <div className="bg-white border border-gray-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600">Taux de reponse</span>
              <span
                className={`text-sm font-bold ${
                  stats.responseRate >= 80
                    ? 'text-green-600'
                    : stats.responseRate >= 60
                      ? 'text-orange-500'
                      : 'text-red-500'
                }`}
              >
                {stats.responseRate.toFixed(1)}%
              </span>
            </div>
            <div
              className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={stats.responseRate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Taux de reponse : ${stats.responseRate.toFixed(1)}%`}
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  stats.responseRate >= 80
                    ? 'bg-green-500'
                    : stats.responseRate >= 60
                      ? 'bg-orange-400'
                      : 'bg-red-400'
                }`}
                style={{ width: `${Math.min(stats.responseRate, 100)}%` }}
              />
            </div>
          </div>
        </>
      )}

      {/* Separateur */}
      <div className="border-t border-gray-100" />

      {/* Documents PDF */}
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Documents PDF
        </h4>

        {errorPdfs && (
          <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{errorPdfs}</p>
        )}

        {loadingPdfs && (
          <div className="flex justify-center py-4">
            <div className="animate-spin w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {!loadingPdfs && !errorPdfs && pdfs.length === 0 && (
          <p className="text-xs text-gray-400 px-1">Aucun document disponible.</p>
        )}

        {!loadingPdfs && pdfs.length > 0 && (
          <div className="flex flex-col gap-2">
            {pdfs.map((pdf) => (
              <PdfItem key={pdf.id} pdf={pdf} />
            ))}
          </div>
        )}
      </div>

      {/* Separateur */}
      <div className="border-t border-gray-100" />

      {/* Historique des QCM */}
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Historique des QCM
        </h4>

        {errorHistory && (
          <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{errorHistory}</p>
        )}

        {loadingHistory && (
          <div className="flex justify-center py-4">
            <div className="animate-spin w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {!loadingHistory && !errorHistory && history.length === 0 && (
          <p className="text-xs text-gray-400 px-1">Aucun historique disponible.</p>
        )}

        {!loadingHistory && history.length > 0 && (
          <div className="flex flex-col gap-2">
            {history.map((entry) => (
              <div
                key={entry.attemptId}
                className="rounded-lg border border-gray-100 bg-gray-50 p-3 flex flex-col gap-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {entry.sessionTitle}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(entry.sessionDate)}
                    </p>
                  </div>
                  {entry.isPassed === true && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Reussi
                    </span>
                  )}
                  {entry.isPassed === false && (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Echoue
                    </span>
                  )}
                  {entry.isPassed === null && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      Soumis
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600">
                  Score :{' '}
                  <span className="font-semibold text-gray-800">
                    {entry.score ?? '-'}/{entry.maxScore ?? '-'}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityPanel;
