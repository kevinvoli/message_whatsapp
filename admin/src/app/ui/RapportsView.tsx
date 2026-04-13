"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Download, RefreshCw, MessageCircle, Users, BarChart2, Calendar } from 'lucide-react';
import { getOverviewSection } from '@/app/lib/api/metrics.api';
import { MetriquesGlobales, PerformanceCommercial, PerformanceTemporelle } from '@/app/lib/definitions';
import { Spinner } from './Spinner';
import { formatDateShort } from '@/app/lib/dateUtils';

const PERIODS = [
    { value: 'today',  label: "Aujourd'hui",     jours: 1 },
    { value: 'week',   label: '7 derniers jours', jours: 7 },
    { value: 'month',  label: '30 derniers jours', jours: 30 },
    { value: 'year',   label: 'Année',            jours: 365 },
] as const;

type Period = typeof PERIODS[number]['value'];

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function toCsv(headers: string[], rows: (string | number)[][]): string {
    const escape = (v: string | number) => {
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
    };
    return [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n');
}

function downloadCsv(content: string, filename: string) {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function formatSeconds(sec: number): string {
    if (!sec || sec <= 0) return '—';
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function todayLabel(): string {
    return new Date().toISOString().slice(0, 10);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ReportCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    iconBg: string;
    onExport: () => void;
    children: React.ReactNode;
}

function ReportCard({ icon, title, description, iconBg, onExport, children }: ReportCardProps) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
                        <p className="text-xs text-gray-400">{description}</p>
                    </div>
                </div>
                <button
                    onClick={onExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                >
                    <Download className="w-3.5 h-3.5" />
                    Exporter CSV
                </button>
            </div>
            <div className="p-6">{children}</div>
        </div>
    );
}

interface StatRowProps { label: string; value: string | number; highlight?: boolean }
function StatRow({ label, value, highlight }: StatRowProps) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
            <span className="text-sm text-gray-600">{label}</span>
            <span className={`text-sm font-semibold ${highlight ? 'text-blue-600' : 'text-gray-900'}`}>{value}</span>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RapportsView() {
    const [period, setPeriod] = useState<Period>('week');
    const [loading, setLoading] = useState(false);
    const [metriques, setMetriques] = useState<MetriquesGlobales | null>(null);
    const [perf, setPerf] = useState<PerformanceCommercial[] | null>(null);
    const [temporelle, setTemporelle] = useState<PerformanceTemporelle[] | null>(null);

    const SectionSkeleton = ({ rows = 4 }: { rows?: number }) => (
        <div className="animate-pulse space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded-lg" />
            ))}
        </div>
    );

    const load = useCallback(async (p: Period) => {
        setLoading(true);
        setMetriques(null);
        setPerf(null);
        setTemporelle(null);

        const globalesP = getOverviewSection<MetriquesGlobales>('globales', p)
            .then((data) => { setMetriques(data); setLoading(false); })
            .catch(() => { setLoading(false); });

        const commerciauxP = getOverviewSection<PerformanceCommercial[]>('commerciaux', p)
            .then((data) => setPerf(data))
            .catch(() => setPerf([]));

        const temporelleP = getOverviewSection<PerformanceTemporelle[]>('temporelle', p)
            .then((data) => setTemporelle(data))
            .catch(() => setTemporelle([]));

        await Promise.allSettled([globalesP, commerciauxP, temporelleP]);
    }, []);

    useEffect(() => { void load(period); }, [load, period]);

    const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? period;

    // ── Export handlers ────────────────────────────────────────────────────────

    const exportMessagerie = () => {
        if (!metriques) return;
        const headers = ['Indicateur', 'Valeur'];
        const rows: (string | number)[][] = [
            ['Période', periodLabel],
            ['Total messages', metriques.totalMessages],
            ['Messages entrants', metriques.messagesEntrants],
            ['Messages sortants', metriques.messagesSortants],
            ['Taux de réponse (%)', metriques.tauxReponse],
            ['Temps de réponse moyen (s)', metriques.tempsReponseMoyen],
            ['Messages en attente', metriques.messagesEnAttente],
        ];
        downloadCsv(toCsv(headers, rows), `rapport_messagerie_${todayLabel()}.csv`);
    };

    const exportEquipe = () => {
        const headers = ['Nom', 'Email', 'Poste', 'Connecté', 'Messages envoyés', 'Messages reçus', 'Taux réponse (%)', 'Conv. actives', 'Temps réponse moy (s)'];
        const rows = (perf ?? []).map((c) => [
            c.name, c.email, c.poste_name,
            c.isConnected ? 'Oui' : 'Non',
            c.nbMessagesEnvoyes, c.nbMessagesRecus,
            c.tauxReponse, c.nbChatsActifs, c.tempsReponseMoyen,
        ]);
        downloadCsv(toCsv(headers, rows), `rapport_equipe_${todayLabel()}.csv`);
    };

    const exportConversations = () => {
        if (!metriques) return;
        const headers = ['Indicateur', 'Valeur'];
        const rows: (string | number)[][] = [
            ['Période', periodLabel],
            ['Total conversations', metriques.totalChats],
            ['Conversations actives', metriques.chatsActifs],
            ['Conversations en attente', metriques.chatsEnAttente],
            ['Conversations fermées', metriques.chatsFermes],
            ['Conversations non lues', metriques.chatsNonLus],
            ['Taux d\'assignation (%)', metriques.tauxAssignation],
            ['Temps première réponse (s)', metriques.tempsPremiereReponse],
            ['Total contacts', metriques.totalContacts],
            ['Nouveaux contacts période', metriques.nouveauxContactsAujourdhui],
            ['Contacts actifs', metriques.contactsActifs],
        ];
        downloadCsv(toCsv(headers, rows), `rapport_conversations_${todayLabel()}.csv`);
    };

    const exportDetailJours = () => {
        const headers = ['Date', 'Total messages', 'Entrants', 'Sortants', 'Conversations'];
        const rows = (temporelle ?? []).map((t) => [
            t.periode, t.nb_messages, t.messages_in, t.messages_out, t.nb_conversations ?? 0,
        ]);
        downloadCsv(toCsv(headers, rows), `rapport_detail_jours_${todayLabel()}.csv`);
    };

    const exportAll = () => {
        exportMessagerie();
        exportEquipe();
        exportConversations();
        exportDetailJours();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-blue-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Rapports</h1>
                        <p className="text-sm text-gray-400">Synthèses exportables par période</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
                        {PERIODS.map((p) => (
                            <button
                                key={p.value}
                                onClick={() => setPeriod(p.value)}
                                className={`px-4 py-2 text-sm font-medium transition-colors ${
                                    period === p.value
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => void load(period)}
                        disabled={loading}
                        className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                        title="Rafraîchir"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {metriques && (
                        <button
                            onClick={exportAll}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                        >
                            <Download className="w-4 h-4" />
                            Tout exporter
                        </button>
                    )}
                </div>
            </div>

            {loading && !metriques && (
                <div className="flex justify-center py-16"><Spinner /></div>
            )}

            {metriques && (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Rapport Messagerie */}
                        <ReportCard
                            icon={<MessageCircle className="w-4 h-4 text-blue-600" />}
                            iconBg="bg-blue-100"
                            title="Activité messagerie"
                            description={`Synthèse des messages — ${periodLabel}`}
                            onExport={exportMessagerie}
                        >
                            <StatRow label="Total messages" value={metriques.totalMessages.toLocaleString('fr-FR')} highlight />
                            <StatRow label="Messages entrants (clients)" value={metriques.messagesEntrants.toLocaleString('fr-FR')} />
                            <StatRow label="Messages sortants (équipe)" value={metriques.messagesSortants.toLocaleString('fr-FR')} />
                            <StatRow label="Taux de réponse" value={`${metriques.tauxReponse}%`} />
                            <StatRow label="Temps de réponse moyen" value={formatSeconds(metriques.tempsReponseMoyen)} />
                            <StatRow label="Messages en attente" value={metriques.messagesEnAttente} />
                        </ReportCard>

                        {/* Rapport Conversations */}
                        <ReportCard
                            icon={<BarChart2 className="w-4 h-4 text-teal-600" />}
                            iconBg="bg-teal-100"
                            title="Conversations & contacts"
                            description={`Répartition et acquisition — ${periodLabel}`}
                            onExport={exportConversations}
                        >
                            <StatRow label="Total conversations" value={metriques.totalChats.toLocaleString('fr-FR')} highlight />
                            <StatRow label="Actives" value={metriques.chatsActifs} />
                            <StatRow label="En attente" value={metriques.chatsEnAttente} />
                            <StatRow label="Fermées" value={metriques.chatsFermes} />
                            <StatRow label="Taux d'assignation" value={`${metriques.tauxAssignation}%`} />
                            <StatRow label="Nouveaux contacts" value={metriques.nouveauxContactsAujourdhui} />
                            <StatRow label="Total contacts actifs" value={metriques.contactsActifs} />
                        </ReportCard>
                    </div>

                    {/* Rapport Équipe */}
                    <ReportCard
                        icon={<Users className="w-4 h-4 text-purple-600" />}
                        iconBg="bg-purple-100"
                        title="Performance de l'équipe"
                        description={`Détail par commercial — ${periodLabel}`}
                        onExport={exportEquipe}
                    >
                        {perf === null ? (
                            <SectionSkeleton rows={5} />
                        ) : perf.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-6">Aucune donnée disponible pour cette période.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase">Commercial</th>
                                            <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Poste</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Envoyés</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Reçus</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Taux rép.</th>
                                            <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Conv. actives</th>
                                            <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-500 uppercase">Tps rép. moy.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {perf.map((c) => (
                                            <tr key={c.id} className="hover:bg-gray-50">
                                                <td className="py-3 pr-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                        <span className="font-medium text-gray-900">{c.name}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-2 text-gray-500">{c.poste_name}</td>
                                                <td className="py-3 px-2 text-right font-semibold text-blue-600">{c.nbMessagesEnvoyes}</td>
                                                <td className="py-3 px-2 text-right text-gray-600">{c.nbMessagesRecus}</td>
                                                <td className="py-3 px-2 text-right">
                                                    <span className={`font-medium ${
                                                        c.tauxReponse >= 80 ? 'text-green-600'
                                                        : c.tauxReponse >= 50 ? 'text-yellow-600'
                                                        : 'text-red-500'
                                                    }`}>{c.tauxReponse}%</span>
                                                </td>
                                                <td className="py-3 px-2 text-right text-gray-700">{c.nbChatsActifs}</td>
                                                <td className="py-3 pl-2 text-right text-gray-500">{formatSeconds(c.tempsReponseMoyen)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </ReportCard>

                    {/* Détail par jour */}
                    {temporelle === null && (
                        <ReportCard
                            icon={<Calendar className="w-4 h-4 text-orange-600" />}
                            iconBg="bg-orange-100"
                            title="Détail par jour"
                            description="Volume de messages et conversations par date"
                            onExport={exportDetailJours}
                        >
                            <SectionSkeleton rows={5} />
                        </ReportCard>
                    )}
                    {temporelle !== null && temporelle.length > 0 && (
                        <ReportCard
                            icon={<Calendar className="w-4 h-4 text-orange-600" />}
                            iconBg="bg-orange-100"
                            title="Détail par jour"
                            description="Volume de messages et conversations par date"
                            onExport={exportDetailJours}
                        >
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Entrants</th>
                                            <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Sortants</th>
                                            <th className="text-right py-2 pl-3 text-xs font-semibold text-gray-500 uppercase">Conversations</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {temporelle.map((t) => (
                                            <tr key={t.periode} className="hover:bg-gray-50">
                                                <td className="py-2.5 pr-4 text-gray-700">{formatDateShort(t.periode)}</td>
                                                <td className="py-2.5 px-3 text-right font-semibold text-gray-900">{t.nb_messages}</td>
                                                <td className="py-2.5 px-3 text-right text-green-600">{t.messages_in}</td>
                                                <td className="py-2.5 px-3 text-right text-blue-600">{t.messages_out}</td>
                                                <td className="py-2.5 pl-3 text-right text-gray-600">{t.nb_conversations ?? 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                                        <tr>
                                            <td className="py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase">Total</td>
                                            <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                                                {temporelle.reduce((s, t) => s + t.nb_messages, 0)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-bold text-green-600">
                                                {temporelle.reduce((s, t) => s + t.messages_in, 0)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-bold text-blue-600">
                                                {temporelle.reduce((s, t) => s + t.messages_out, 0)}
                                            </td>
                                            <td className="py-2.5 pl-3 text-right font-bold text-gray-600">
                                                {temporelle.reduce((s, t) => s + (t.nb_conversations ?? 0), 0)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </ReportCard>
                    )}
                </>
            )}
        </div>
    );
}
