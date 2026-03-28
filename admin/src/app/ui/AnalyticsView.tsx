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
import { RefreshCw, TrendingUp, MessageCircle, Clock, Users, ArrowDownLeft, ArrowUpRight, CalendarRange, X } from 'lucide-react';
import { getOverviewMetriques } from '@/app/lib/api';
import { MetriquesGlobales, PerformanceCommercial, PerformanceTemporelle } from '@/app/lib/definitions';
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

export default function AnalyticsView() {
    const [period, setPeriod] = useState<Period>('week');
    const [loading, setLoading] = useState(false);
    const [metriques, setMetriques] = useState<MetriquesGlobales | null>(null);
    const [perf, setPerf] = useState<PerformanceCommercial[]>([]);
    const [temporelle, setTemporelle] = useState<PerformanceTemporelle[]>([]);

    // Filtre plage de dates
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [activeDateFrom, setActiveDateFrom] = useState('');
    const [activeDateTo, setActiveDateTo] = useState('');
    const hasCustomRange = !!(activeDateFrom && activeDateTo);

    const load = useCallback(async (p: Period, from?: string, to?: string) => {
        setLoading(true);
        try {
            const data = await getOverviewMetriques(p, from, to);
            setMetriques(data.metriques);
            setPerf(data.performanceCommercial);
            setTemporelle(data.performanceTemporelle);
        } catch {
            // silencieux — l'UI reste avec les données précédentes
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(period, activeDateFrom || undefined, activeDateTo || undefined);
    }, [load, period, activeDateFrom, activeDateTo]);

    const applyCustomRange = () => {
        if (!dateFrom || !dateTo) return;
        setActiveDateFrom(dateFrom);
        setActiveDateTo(dateTo);
    };

    const clearCustomRange = () => {
        setDateFrom('');
        setDateTo('');
        setActiveDateFrom('');
        setActiveDateTo('');
    };

    const chartData = temporelle.map((t) => ({
        date: formatDate(t.periode, period),
        'Entrants': t.messages_in,
        'Sortants': t.messages_out,
        'Total': t.nb_messages,
    }));

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

                    <button
                        onClick={() => void load(period, activeDateFrom || undefined, activeDateTo || undefined)}
                        disabled={loading}
                        className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                        title="Rafraîchir"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

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
                    {chartData.length > 0 && (
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
                            {perf.length === 0 ? (
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
                                            {perf.map((c) => (
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
        </div>
    );
}
