"use client";

import React, { useCallback, useEffect, useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line,
} from 'recharts';
import { RefreshCw, TrendingUp, MessageCircle, Clock, Users, ArrowDownLeft, ArrowUpRight, CalendarRange, X, AlertCircle, Activity } from 'lucide-react';
import { getOverviewSection } from '@/app/lib/api/metrics.api';
import { getAnalyticsSummary, getAnalyticsConversations, getAnalyticsAgents, getAnalyticsChannels } from '@/app/lib/api/analytics.api';
import { MetriquesGlobales, PerformanceCommercial, PerformanceTemporelle, AnalyticsSummary, AnalyticsConversationDay, AnalyticsAgent, AnalyticsChannel } from '@/app/lib/definitions';
import { Spinner } from './Spinner';

const PERIODS = [
    { value: 'today', label: "Aujourd'hui" },
    { value: 'week', label: '7 derniers jours' },
    { value: 'month', label: '30 derniers jours' },
    { value: 'year', label: 'Année' },
] as const;

type Period = typeof PERIODS[number]['value'];

function formatSeconds(sec: number): string {
    if (!sec || sec <= 0) return '—';
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(dateStr: string, period: Period): string {
    const d = new Date(dateStr);
    if (period === 'today') return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (period === 'year') return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

interface KpiCardProps {
    label: string;
    value: string | number;
    sub?: string;
    icon: React.ReactNode;
    color: string;
}

function KpiCard({ label, value, sub, icon, color }: KpiCardProps) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-start gap-4">
            <div className={`p-3 rounded-lg ${color}`}>
                {icon}
            </div>
            <div>
                <p className="text-sm text-gray-500 font-medium">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
                {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
            </div>
        </div>
    );
}

type MainTab = 'overview' | 'detailed';

export default function AnalyticsView() {
    const [mainTab, setMainTab] = useState<MainTab>('overview');

    // ─── Onglet Overview ─────────────────────────────────────────────────────
    const [period, setPeriod] = useState<Period>('today');
    const [loading, setLoading] = useState(false);
    const [metriques, setMetriques] = useState<MetriquesGlobales | null>(null);
    const [perf, setPerf] = useState<PerformanceCommercial[] | null>(null);
    const [temporelle, setTemporelle] = useState<PerformanceTemporelle[] | null>(null);
    const [computedAt, setComputedAt] = useState<Date | null>(null);
    const [fromSnapshot, setFromSnapshot] = useState(false);

    // Filtre plage de dates (overview)
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [activeDateFrom, setActiveDateFrom] = useState('');
    const [activeDateTo, setActiveDateTo] = useState('');
    const hasCustomRange = !!(activeDateFrom && activeDateTo);

    const load = useCallback(async (p: Period, from?: string, to?: string) => {
        setLoading(true);
        setMetriques(null);
        setPerf(null);
        setTemporelle(null);

        const globalesP = getOverviewSection<MetriquesGlobales>('globales', p, from, to)
            .then((data) => { setMetriques(data); setLoading(false); setComputedAt(new Date()); })
            .catch(() => setLoading(false));

        const commerciauxP = getOverviewSection<PerformanceCommercial[]>('commerciaux', p, from, to)
            .then((data) => setPerf(data))
            .catch(() => setPerf([]));

        const temporelleP = getOverviewSection<PerformanceTemporelle[]>('temporelle', p, from, to)
            .then((data) => { setTemporelle(data); setFromSnapshot(false); })
            .catch(() => setTemporelle([]));

        await Promise.allSettled([globalesP, commerciauxP, temporelleP]);
    }, []);

    useEffect(() => {
        void load(period, activeDateFrom || undefined, activeDateTo || undefined);
    }, [load, period, activeDateFrom, activeDateTo]);

    // ─── Onglet Analytics détaillés ──────────────────────────────────────────
    const [detailedDateFrom, setDetailedDateFrom] = useState('');
    const [detailedDateTo, setDetailedDateTo] = useState('');
    const [detailedLoading, setDetailedLoading] = useState(false);
    const [detailedSummary, setDetailedSummary] = useState<AnalyticsSummary | null>(null);
    const [detailedConversations, setDetailedConversations] = useState<AnalyticsConversationDay[] | null>(null);
    const [detailedAgents, setDetailedAgents] = useState<AnalyticsAgent[] | null>(null);
    const [detailedChannels, setDetailedChannels] = useState<AnalyticsChannel[] | null>(null);
    const [detailedError, setDetailedError] = useState<string | null>(null);

    const loadDetailed = useCallback(async (from?: string, to?: string) => {
        setDetailedLoading(true);
        setDetailedError(null);
        setDetailedSummary(null);
        setDetailedConversations(null);
        setDetailedAgents(null);
        setDetailedChannels(null);
        const params = { dateFrom: from, dateTo: to };
        const [summaryRes, convsRes, agentsRes, channelsRes] = await Promise.allSettled([
            getAnalyticsSummary(params),
            getAnalyticsConversations(params),
            getAnalyticsAgents(params),
            getAnalyticsChannels(params),
        ]);
        if (summaryRes.status === 'fulfilled') setDetailedSummary(summaryRes.value);
        else setDetailedError('Erreur chargement résumé analytics.');
        if (convsRes.status === 'fulfilled') setDetailedConversations(convsRes.value);
        if (agentsRes.status === 'fulfilled') setDetailedAgents(agentsRes.value);
        if (channelsRes.status === 'fulfilled') setDetailedChannels(channelsRes.value);
        setDetailedLoading(false);
    }, []);

    useEffect(() => {
        if (mainTab === 'detailed') {
            void loadDetailed(detailedDateFrom || undefined, detailedDateTo || undefined);
        }
    }, [mainTab, loadDetailed, detailedDateFrom, detailedDateTo]);

    const applyCustomRange = () => {
        if (!dateFrom || !dateTo) return;
        setActiveDateFrom(new Date(dateFrom).toISOString());
        setActiveDateTo(new Date(dateTo).toISOString());
    };

    const clearCustomRange = () => {
        setDateFrom('');
        setDateTo('');
        setActiveDateFrom('');
        setActiveDateTo('');
    };

    const chartData = (temporelle ?? []).map((t) => ({
        date: formatDate(t.periode, period),
        'Entrants': t.messages_in,
        'Sortants': t.messages_out,
        'Total': t.nb_messages,
    }));

    const SectionSkeleton = ({ rows = 3 }: { rows?: number }) => (
        <div className="animate-pulse space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg" />
            ))}
        </div>
    );

    // Répartition conversations
    const chatsTotal = (metriques?.chatsActifs ?? 0) + (metriques?.chatsEnAttente ?? 0) + (metriques?.chatsFermes ?? 0);
    const chatBars = [
        { label: 'Actifs', count: metriques?.chatsActifs ?? 0, color: 'bg-green-500' },
        { label: 'En attente', count: metriques?.chatsEnAttente ?? 0, color: 'bg-yellow-400' },
        { label: 'Fermés', count: metriques?.chatsFermes ?? 0, color: 'bg-gray-300' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                    <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
                </div>
                {mainTab === 'overview' && (
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Période prédéfinie — désactivée si plage custom active */}
                        <div className={`flex rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm ${hasCustomRange ? 'opacity-40 pointer-events-none' : ''}`}>
                            {PERIODS.map((p) => (
                                <button
                                    key={p.value}
                                    onClick={() => setPeriod(p.value)}
                                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                                        period === p.value && !hasCustomRange
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Filtre plage de dates */}
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                            <CalendarRange className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <input
                                type="datetime-local"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="text-sm text-gray-700 border-none outline-none bg-transparent w-44"
                            />
                            <span className="text-gray-400 text-sm">→</span>
                            <input
                                type="datetime-local"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="text-sm text-gray-700 border-none outline-none bg-transparent w-44"
                            />
                            <button
                                onClick={applyCustomRange}
                                disabled={!dateFrom || !dateTo}
                                className="ml-1 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Appliquer
                            </button>
                            {hasCustomRange && (
                                <button
                                    onClick={clearCustomRange}
                                    className="ml-1 p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"
                                    title="Effacer le filtre"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {computedAt && (() => {
                            const ageMin = Math.round((Date.now() - computedAt.getTime()) / 60000);
                            const isStale = ageMin > 15;
                            return (
                                <span className={`flex items-center gap-1 text-sm ${isStale ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                                    {isStale && <AlertCircle className="w-4 h-4" />}
                                    {fromSnapshot
                                        ? `Données mises à jour il y a ${ageMin} min`
                                        : 'Données en temps réel'}
                                    {isStale && ' — potentiellement obsolètes'}
                                </span>
                            );
                        })()}
                        <button
                            onClick={() => void load(period, activeDateFrom || undefined, activeDateTo || undefined)}
                            disabled={loading}
                            className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                            title="Rafraîchir"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                )}
            </div>

            {/* Onglets principaux */}
            <div className="flex gap-1 border-b border-gray-200">
                <button
                    onClick={() => setMainTab('overview')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        mainTab === 'overview'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <TrendingUp className="w-4 h-4" />
                    Vue d&apos;ensemble
                </button>
                <button
                    onClick={() => setMainTab('detailed')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        mainTab === 'detailed'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Activity className="w-4 h-4" />
                    Analytics détaillés
                </button>
            </div>

            {/* ─── Onglet Overview ─────────────────────────────────────────── */}
            {mainTab === 'overview' && (
              <>
            {/* Badge plage active */}
            {hasCustomRange && (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 w-fit">
                    <CalendarRange className="w-4 h-4 flex-shrink-0" />
                    <span>Filtre actif : <strong>{new Date(activeDateFrom).toLocaleString('fr-FR')}</strong> → <strong>{new Date(activeDateTo).toLocaleString('fr-FR')}</strong></span>
                    <button onClick={clearCustomRange} className="ml-2 text-blue-400 hover:text-blue-700">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {loading && !metriques && (
                <div className="flex justify-center py-16">
                    <Spinner />
                </div>
            )}

            {metriques && (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <KpiCard
                            label="Messages entrants"
                            value={metriques.messagesEntrants.toLocaleString('fr-FR')}
                            sub="Reçus sur la période"
                            icon={<ArrowDownLeft className="w-5 h-5 text-green-600" />}
                            color="bg-green-100"
                        />
                        <KpiCard
                            label="Messages sortants"
                            value={metriques.messagesSortants.toLocaleString('fr-FR')}
                            sub="Envoyés sur la période"
                            icon={<ArrowUpRight className="w-5 h-5 text-blue-600" />}
                            color="bg-blue-100"
                        />
                        <KpiCard
                            label="Taux de réponse"
                            value={`${metriques.tauxReponse}%`}
                            sub="Messages OUT / IN"
                            icon={<MessageCircle className="w-5 h-5 text-purple-600" />}
                            color="bg-purple-100"
                        />
                        <KpiCard
                            label="Temps de réponse moyen"
                            value={formatSeconds(metriques.tempsReponseMoyen)}
                            sub="Délai moyen de réponse"
                            icon={<Clock className="w-5 h-5 text-orange-600" />}
                            color="bg-orange-100"
                        />
                        <KpiCard
                            label="Nouvelles conversations"
                            value={metriques.totalChats.toLocaleString('fr-FR')}
                            sub={`${metriques.chatsActifs} actives · ${metriques.chatsEnAttente} en attente`}
                            icon={<Users className="w-5 h-5 text-teal-600" />}
                            color="bg-teal-100"
                        />
                        <KpiCard
                            label="Nouveaux contacts"
                            value={metriques.nouveauxContactsAujourdhui.toLocaleString('fr-FR')}
                            sub={`${metriques.totalContacts} contacts au total`}
                            icon={<Users className="w-5 h-5 text-indigo-600" />}
                            color="bg-indigo-100"
                        />
                        <KpiCard
                            label="Taux d'assignation"
                            value={`${metriques.tauxAssignation}%`}
                            sub="Conversations assignées"
                            icon={<TrendingUp className="w-5 h-5 text-pink-600" />}
                            color="bg-pink-100"
                        />
                        <KpiCard
                            label="Commerciaux connectés"
                            value={`${metriques.commerciauxConnectes} / ${metriques.commerciauxTotal}`}
                            sub={`${metriques.commerciauxActifs} avec conversations actives`}
                            icon={<Users className="w-5 h-5 text-yellow-600" />}
                            color="bg-yellow-100"
                        />
                    </div>

                    {/* Graphique volume de messages */}
                    {temporelle === null && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <h2 className="text-base font-semibold text-gray-900 mb-4">Volume de messages</h2>
                            <SectionSkeleton rows={5} />
                        </div>
                    )}
                    {temporelle !== null && chartData.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <h2 className="text-base font-semibold text-gray-900 mb-4">Volume de messages</h2>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={chartData} barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="Entrants" fill="#22c55e" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="Sortants" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Évolution du taux de réponse */}
                    {chartData.length > 1 && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <h2 className="text-base font-semibold text-gray-900 mb-4">Évolution Entrants vs Sortants</h2>
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="Entrants" stroke="#22c55e" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="Sortants" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="Total" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Répartition conversations */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <h2 className="text-base font-semibold text-gray-900 mb-4">Répartition conversations</h2>
                            <div className="space-y-3">
                                {chatBars.map((bar) => (
                                    <div key={bar.label}>
                                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                                            <span>{bar.label}</span>
                                            <span className="font-semibold">{bar.count}</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2.5">
                                            <div
                                                className={`${bar.color} h-2.5 rounded-full transition-all`}
                                                style={{ width: chatsTotal > 0 ? `${Math.round((bar.count / chatsTotal) * 100)}%` : '0%' }}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {chatsTotal > 0 ? `${Math.round((bar.count / chatsTotal) * 100)}%` : '0%'}
                                        </p>
                                    </div>
                                ))}
                                {chatsTotal === 0 && (
                                    <p className="text-sm text-gray-400 text-center py-4">Aucune conversation</p>
                                )}
                            </div>
                        </div>

                        {/* Performance commerciaux top 5 */}
                        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                            <h2 className="text-base font-semibold text-gray-900 mb-4">Performance par commercial</h2>
                            {perf === null ? <SectionSkeleton rows={4} /> : (perf ?? []).length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">Aucune donnée disponible</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-100">
                                                <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase">Commercial</th>
                                                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Envoyés</th>
                                                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Reçus</th>
                                                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Taux rép.</th>
                                                <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-500 uppercase">Conv. actives</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {(perf ?? []).map((c) => (
                                                <tr key={c.id} className="hover:bg-gray-50">
                                                    <td className="py-2.5 pr-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                            <div>
                                                                <p className="font-medium text-gray-900">{c.name}</p>
                                                                <p className="text-xs text-gray-400">{c.poste_name}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-2 text-right font-semibold text-blue-600">{c.nbMessagesEnvoyes}</td>
                                                    <td className="py-2.5 px-2 text-right text-gray-600">{c.nbMessagesRecus}</td>
                                                    <td className="py-2.5 px-2 text-right">
                                                        <span className={`font-medium ${
                                                            c.tauxReponse >= 80 ? 'text-green-600'
                                                            : c.tauxReponse >= 50 ? 'text-yellow-600'
                                                            : 'text-red-500'
                                                        }`}>
                                                            {c.tauxReponse}%
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 pl-2 text-right text-gray-700">{c.nbChatsActifs}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
              </>
            )}

            {/* ─── Onglet Analytics détaillés ──────────────────────────────── */}
            {mainTab === 'detailed' && (
              <div className="space-y-6">
                {/* Filtres date */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <label htmlFor="det-date-from" className="block text-xs font-medium text-gray-600">Date de début</label>
                    <input
                      id="det-date-from"
                      type="date"
                      value={detailedDateFrom}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDetailedDateFrom(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="det-date-to" className="block text-xs font-medium text-gray-600">Date de fin</label>
                    <input
                      id="det-date-to"
                      type="date"
                      value={detailedDateTo}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDetailedDateTo(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={() => void loadDetailed(detailedDateFrom || undefined, detailedDateTo || undefined)}
                    disabled={detailedLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${detailedLoading ? 'animate-spin' : ''}`} />
                    {detailedLoading ? 'Chargement…' : 'Actualiser'}
                  </button>
                  {(detailedDateFrom || detailedDateTo) && (
                    <button
                      onClick={() => { setDetailedDateFrom(''); setDetailedDateTo(''); }}
                      className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      <X className="w-4 h-4" /> Effacer
                    </button>
                  )}
                </div>

                {detailedLoading && (
                  <div className="flex justify-center py-16">
                    <Spinner />
                  </div>
                )}

                {detailedError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {detailedError}
                  </div>
                )}

                {/* Résumé KPIs */}
                {detailedSummary && (
                  <div className="space-y-4">
                    <h2 className="text-base font-semibold text-gray-900">Résumé</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <KpiCard
                        label="Conversations totales"
                        value={detailedSummary.totalConversations.toLocaleString('fr-FR')}
                        sub={`${detailedSummary.openConversations} ouvertes · ${detailedSummary.closedConversations} fermées`}
                        icon={<Users className="w-5 h-5 text-blue-600" />}
                        color="bg-blue-100"
                      />
                      <KpiCard
                        label="Messages entrants"
                        value={detailedSummary.messagesIn.toLocaleString('fr-FR')}
                        sub={`Total : ${detailedSummary.totalMessages.toLocaleString('fr-FR')}`}
                        icon={<ArrowDownLeft className="w-5 h-5 text-green-600" />}
                        color="bg-green-100"
                      />
                      <KpiCard
                        label="Messages sortants"
                        value={detailedSummary.messagesOut.toLocaleString('fr-FR')}
                        sub="Envoyés sur la période"
                        icon={<ArrowUpRight className="w-5 h-5 text-purple-600" />}
                        color="bg-purple-100"
                      />
                      <KpiCard
                        label="Tps. 1re réponse moy."
                        value={formatSeconds(detailedSummary.avgFirstResponseTimeSeconds)}
                        sub={`Résolution : ${formatSeconds(detailedSummary.avgResolutionTimeSeconds)}`}
                        icon={<Clock className="w-5 h-5 text-orange-600" />}
                        color="bg-orange-100"
                      />
                    </div>
                  </div>
                )}

                {/* Volume conversations par jour */}
                {detailedConversations !== null && detailedConversations.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
                    <h2 className="text-base font-semibold text-gray-900">Conversations par jour</h2>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={detailedConversations} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="opened" name="Ouvertes" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="closed" name="Fermées" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Performance agents */}
                  {detailedAgents !== null && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                      <h2 className="text-base font-semibold text-gray-900 mb-4">Agents</h2>
                      {detailedAgents.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">Aucune donnée agent</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Messages</th>
                                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Convs.</th>
                                <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-500 uppercase">Tps. rép.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {detailedAgents.map((a) => (
                                <tr key={a.agentId} className="hover:bg-gray-50">
                                  <td className="py-2.5 pr-3">
                                    <p className="font-medium text-gray-900">{a.agentName}</p>
                                    <p className="text-xs text-gray-400">{a.posteName}</p>
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-semibold text-blue-600">{a.messagesOut}</td>
                                  <td className="py-2.5 px-2 text-right text-gray-600">{a.chatsHandled}</td>
                                  <td className="py-2.5 pl-2 text-right text-gray-600">{formatSeconds(a.avgResponseSeconds)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Canaux */}
                  {detailedChannels !== null && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                      <h2 className="text-base font-semibold text-gray-900 mb-4">Canaux</h2>
                      {detailedChannels.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">Aucune donnée canal</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">Canal</th>
                                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">IN</th>
                                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">OUT</th>
                                <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-500 uppercase">Convs.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {detailedChannels.map((ch) => (
                                <tr key={ch.channelId} className="hover:bg-gray-50">
                                  <td className="py-2.5 pr-3">
                                    <p className="font-medium text-gray-900">{ch.label ?? ch.channelId}</p>
                                    <p className="text-xs text-gray-400">{ch.provider}</p>
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-green-600 font-medium">{ch.messagesIn}</td>
                                  <td className="py-2.5 px-2 text-right text-blue-600 font-medium">{ch.messagesOut}</td>
                                  <td className="py-2.5 pl-2 text-right text-gray-600">{ch.totalConversations}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

        </div>
    );
}
