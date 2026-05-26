"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, RefreshCw, MessageCircle, MessageSquare,
  Network, Radio, Users, TrendingUp, Clock, CheckCircle,
} from 'lucide-react';
import { MetriquesGlobales, PerformanceCommercial } from '@/app/lib/definitions';
import { getMetriquesDedicated, getPerformanceCommerciauxDedie } from '@/app/lib/api';

interface DedicatedChannelsViewProps {
  selectedPeriod?: string;
  dateFrom?: string;
  dateTo?: string;
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ElementType;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'slate';
}) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   border: 'border-blue-200' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-600',  border: 'border-green-200' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', border: 'border-purple-200' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-200' },
    slate:  { bg: 'bg-slate-50',  icon: 'text-slate-600',  border: 'border-slate-200' },
  };
  const c = colors[color];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        <Icon className={`h-4 w-4 ${c.icon}`} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
  );
}

export default function DedicatedChannelsView({
  selectedPeriod = 'today',
  dateFrom,
  dateTo,
}: DedicatedChannelsViewProps) {
  const [metriques, setMetriques] = useState<MetriquesGlobales | null>(null);
  const [commerciaux, setCommerciaux] = useState<PerformanceCommercial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [m, c] = await Promise.all([
        getMetriquesDedicated(selectedPeriod, dateFrom, dateTo),
        getPerformanceCommerciauxDedie(selectedPeriod, dateFrom, dateTo),
      ]);
      setMetriques(m);
      setCommerciaux(c);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 90s
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 90_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Canaux dédiés</h2>
            <p className="text-sm text-gray-500">
              Activité des postes avec canal dédié — données isolées du dashboard principal
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          title="Rafraîchir"
          aria-label="Rafraîchir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Bannière d'information */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <p className="text-xs text-blue-700">
          Ces métriques concernent <strong>uniquement les postes à canaux dédiés</strong> (usage administratif).
          Elles sont exclues de la vue Globale, de l&apos;Analytique et de la vue Commerciaux pour ne pas fausser
          les indicateurs de prise de décision.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Erreur lors du chargement des données. Vérifiez votre connexion et réessayez.
        </div>
      )}

      {loading && !metriques && (
        <p className="text-sm text-gray-500">Chargement...</p>
      )}

      {metriques && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              title="Messages"
              value={metriques.totalMessages.toLocaleString('fr-FR')}
              subtitle={`↓ ${metriques.messagesEntrants} entrants · ↑ ${metriques.messagesSortants} sortants`}
              icon={MessageCircle}
              color="blue"
            />
            <KpiCard
              title="Conversations"
              value={metriques.totalConversations.toLocaleString('fr-FR')}
              subtitle={`${metriques.chatsActifs} actives · ${metriques.chatsEnAttente} en attente`}
              icon={MessageSquare}
              color="green"
            />
            <KpiCard
              title="Postes dédiés"
              value={metriques.totalPostes.toLocaleString('fr-FR')}
              subtitle={`${metriques.postesActifs} actifs`}
              icon={Network}
              color="purple"
            />
            <KpiCard
              title="Canaux dédiés"
              value={metriques.totalChannels.toLocaleString('fr-FR')}
              subtitle={`${metriques.channelsActifs} actifs`}
              icon={Radio}
              color="orange"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              title="Commerciaux"
              value={metriques.commerciauxTotal.toLocaleString('fr-FR')}
              subtitle={`${metriques.commerciauxConnectes} connectés`}
              icon={Users}
              color="slate"
            />
            <KpiCard
              title="Taux de réponse"
              value={`${metriques.tauxReponse}%`}
              icon={TrendingUp}
              color="green"
            />
            <KpiCard
              title="Temps réponse moyen"
              value={metriques.tempsReponseMoyen > 0
                ? `${Math.round(metriques.tempsReponseMoyen / 60)} min`
                : '—'}
              icon={Clock}
              color="blue"
            />
            <KpiCard
              title="Conversations fermées"
              value={metriques.chatsFermes.toLocaleString('fr-FR')}
              icon={CheckCircle}
              color="slate"
            />
          </div>

          {/* Table commerciaux dédiés */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Commerciaux sur postes dédiés</h3>
              <span className="text-xs text-gray-500">{commerciaux.length} commercial{commerciaux.length !== 1 ? 'aux' : ''}</span>
            </div>
            {commerciaux.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">Aucun commercial sur poste dédié pour cette période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Commercial</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Poste</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Msg envoyés</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Msg reçus</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Taux réponse</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Chats actifs</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {commerciaux.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{c.name}</p>
                            <p className="text-xs text-gray-500">{c.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{c.poste_name ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">{c.nbMessagesEnvoyes}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">{c.nbMessagesRecus}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${c.tauxReponse >= 80 ? 'text-green-600' : c.tauxReponse >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {c.tauxReponse}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">{c.nbChatsActifs}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${c.isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {c.isConnected ? 'En ligne' : 'Hors ligne'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
