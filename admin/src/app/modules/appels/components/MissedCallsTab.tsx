'use client';

import { useEffect, useState } from 'react';
import { Loader2, Phone, PhoneOff, AlertTriangle, CheckCircle, Clock, X } from 'lucide-react';
import {
    getMissedCallMetrics,
    listMissedCalls,
    closeMissedCall,
    MissedCallMetrics,
    MissedCallRow,
    MissedCallStatus,
} from '@/app/lib/api/missed-calls.api';
import { formatDate, formatTime } from '@/app/lib/dateUtils';

const STATUS_LABELS: Record<MissedCallStatus, string> = {
    pending:     'En attente',
    assigned:    'Assigné',
    called_back: 'Rappelé',
    escalated:   'Escaladé',
    closed:      'Fermé',
};
const STATUS_COLORS: Record<MissedCallStatus, string> = {
    pending:     'bg-yellow-100 text-yellow-800',
    assigned:    'bg-blue-100 text-blue-800',
    called_back: 'bg-green-100 text-green-800',
    escalated:   'bg-red-100 text-red-800',
    closed:      'bg-gray-100 text-gray-600',
};

function formatDelay(s: number | null): string {
    if (s === null) return '—';
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return `${h}h${r > 0 ? ' ' + String(r) + 'min' : ''}`;
}

function MetricCard({
    icon,
    label,
    value,
    alert = false,
    good = false,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    alert?: boolean;
    good?: boolean;
}) {
    return (
        <div className={`bg-white rounded-lg border p-4 ${alert ? 'border-red-300' : good ? 'border-green-300' : ''}`}>
            <div className="flex items-center gap-2 mb-1">{icon}<span className="text-sm text-gray-500">{label}</span></div>
            <p className={`text-2xl font-semibold ${alert ? 'text-red-600' : good ? 'text-green-600' : 'text-gray-800'}`}>{value}</p>
        </div>
    );
}

export default function MissedCallsTab() {
    const [metrics, setMetrics]   = useState<MissedCallMetrics | null>(null);
    const [items, setItems]       = useState<MissedCallRow[]>([]);
    const [total, setTotal]       = useState(0);
    const [loading, setLoading]   = useState(true);
    const [page, setPage]         = useState(1);
    const [statusFilter, setStatusFilter] = useState<MissedCallStatus | ''>('');
    const [closing, setClosing]   = useState<Record<string, boolean>>({});
    const LIMIT = 50;

    const load = async () => {
        setLoading(true);
        try {
            const [m, list] = await Promise.all([
                getMissedCallMetrics(),
                listMissedCalls({ status: statusFilter || undefined, page, limit: LIMIT }),
            ]);
            setMetrics(m);
            setItems(list.items);
            setTotal(list.total);
        } finally {
            setLoading(false);
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { void load(); }, [page, statusFilter]);

    const handleClose = async (id: string) => {
        setClosing((c) => ({ ...c, [id]: true }));
        try { await closeMissedCall(id); await load(); }
        finally { setClosing((c) => ({ ...c, [id]: false })); }
    };

    return (
        <div className="space-y-6">
            {loading && !metrics ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
            ) : metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <MetricCard icon={<Phone className="w-5 h-5 text-blue-500" />}          label="Aujourd'hui" value={String(metrics.totalToday)} />
                    <MetricCard icon={<Clock className="w-5 h-5 text-yellow-500" />}         label="En cours"    value={String(metrics.totalAssigned + metrics.totalPending)} />
                    <MetricCard icon={<AlertTriangle className="w-5 h-5 text-red-500" />}    label="Escaladés"   value={String(metrics.totalEscalated)} alert={metrics.totalEscalated > 0} />
                    <MetricCard icon={<CheckCircle className="w-5 h-5 text-green-500" />}    label="Taux SLA"    value={`${metrics.slaComplianceRate}%`} good={metrics.slaComplianceRate >= 80} />
                </div>
            )}

            {metrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg border p-4">
                        <p className="text-sm text-gray-500 mb-1">Délai moyen de rappel</p>
                        <p className="text-2xl font-semibold text-gray-800">{formatDelay(metrics.avgHandlingDelaySeconds)}</p>
                    </div>
                    <div className="bg-white rounded-lg border p-4">
                        <p className="text-sm text-gray-500 mb-2">Top postes en retard</p>
                        {metrics.topPostesOverdue.length === 0 ? (
                            <p className="text-sm text-gray-400">Aucun retard</p>
                        ) : (
                            <ul className="space-y-1">
                                {metrics.topPostesOverdue.map((p) => (
                                    <li key={p.posteId} className="flex justify-between text-sm">
                                        <span className="text-gray-700 truncate">{p.posteName ?? p.posteId.slice(0, 8) + '...'}</span>
                                        <span className="font-medium text-red-600">{p.count} appel(s)</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            <div className="flex gap-3 flex-wrap">
                {(['', 'pending', 'assigned', 'escalated', 'called_back', 'closed'] as const).map((s) => (
                    <button
                        key={s}
                        onClick={() => { setStatusFilter(s); setPage(1); }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                    >
                        {s === '' ? 'Tous' : STATUS_LABELS[s as MissedCallStatus]}
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-lg border overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Client</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Heure appel</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Poste</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Commercial</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Délai</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">SLA</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={8} className="py-12 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline-block mr-2" />Chargement...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td colSpan={8} className="py-12 text-center text-gray-400">Aucun appel en absence</td></tr>
                        ) : items.map((row) => (
                            <tr key={row.id} className={`hover:bg-gray-50 ${row.status === 'escalated' ? 'bg-red-50' : ''}`}>
                                <td className="px-4 py-3">
                                    <div className="font-medium text-gray-900">{row.clientName ?? row.clientPhone}</div>
                                    {row.clientName && <div className="text-xs text-gray-500">{row.clientPhone}</div>}
                                </td>
                                <td className="px-4 py-3 text-gray-600">{formatDate(row.occurredAt)} {formatTime(row.occurredAt)}</td>
                                <td className="px-4 py-3 text-gray-700 text-sm">{row.posteName ?? (row.posteId ? row.posteId.slice(0, 8) + '...' : '—')}</td>
                                <td className="px-4 py-3 text-gray-700 text-sm">{row.commercialName ?? (row.commercialId ? row.commercialId.slice(0, 8) + '...' : '—')}</td>
                                <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status]}`}>{STATUS_LABELS[row.status]}</span></td>
                                <td className="px-4 py-3 text-gray-600">{formatDelay(row.handlingDelaySeconds)}</td>
                                <td className="px-4 py-3">
                                    {row.slaBreachedAt ? (
                                        <span className="text-red-600 text-xs">{formatDate(row.slaBreachedAt)} {formatTime(row.slaBreachedAt)}</span>
                                    ) : (
                                        <span className="text-green-500 text-xs">OK</span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {!['called_back', 'closed'].includes(row.status) && (
                                        <button
                                            onClick={() => void handleClose(row.id)}
                                            disabled={closing[row.id]}
                                            title="Fermer manuellement"
                                            className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                                        >
                                            {closing[row.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {total > LIMIT && (
                <div className="flex justify-center gap-2">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border text-sm disabled:opacity-40">Précédent</button>
                    <span className="px-3 py-1 text-sm text-gray-600">Page {page} / {Math.ceil(total / LIMIT)}</span>
                    <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / LIMIT)} className="px-3 py-1 rounded border text-sm disabled:opacity-40">Suivant</button>
                </div>
            )}
        </div>
    );
}
