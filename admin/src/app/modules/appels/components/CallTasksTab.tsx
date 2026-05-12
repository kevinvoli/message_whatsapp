'use client';

import { useEffect, useState } from 'react';
import { Loader2, Phone, Clock, CheckCircle, Timer } from 'lucide-react';
import {
    getCallTaskMetrics,
    listCallTasks,
    CallTaskCategory,
    CallTaskMetrics,
    CallTaskRow,
    CallTaskStatus,
} from '@/app/lib/api/call-tasks.api';
import { formatDate, formatTime } from '@/app/lib/dateUtils';

const STATUS_LABELS: Record<CallTaskStatus, string> = {
    pending: 'En attente',
    done:    'Effectué',
};
const STATUS_COLORS: Record<CallTaskStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    done:    'bg-green-100 text-green-800',
};

function formatDuration(s: number | null): string {
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
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-1">{icon}<span className="text-sm text-gray-500">{label}</span></div>
            <p className="text-2xl font-semibold text-gray-800">{value}</p>
        </div>
    );
}

interface CallTasksTabProps {
    category: CallTaskCategory;
}

export default function CallTasksTab({ category }: CallTasksTabProps) {
    const [metrics, setMetrics] = useState<CallTaskMetrics | null>(null);
    const [items, setItems]     = useState<CallTaskRow[]>([]);
    const [total, setTotal]     = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage]       = useState(1);
    const [statusFilter, setStatusFilter] = useState<CallTaskStatus | ''>('');
    const LIMIT = 50;

    const load = async () => {
        setLoading(true);
        try {
            const [m, list] = await Promise.all([
                getCallTaskMetrics(category),
                listCallTasks({ category, status: statusFilter || undefined, page, limit: LIMIT }),
            ]);
            setMetrics(m);
            setItems(list.items);
            setTotal(list.total);
        } finally {
            setLoading(false);
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { void load(); }, [category, page, statusFilter]);

    // reset pagination quand la catégorie change
    useEffect(() => { setPage(1); setStatusFilter(''); }, [category]);

    return (
        <div className="space-y-6">
            {loading && !metrics ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
            ) : metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <MetricCard icon={<Phone className="w-5 h-5 text-blue-500" />}     label="Aujourd'hui"   value={String(metrics.totalToday)} />
                    <MetricCard icon={<Clock className="w-5 h-5 text-yellow-500" />}   label="En attente"    value={String(metrics.totalPending)} />
                    <MetricCard icon={<CheckCircle className="w-5 h-5 text-green-500" />} label="Effectués"  value={String(metrics.totalDone)} />
                    <MetricCard icon={<Timer className="w-5 h-5 text-gray-400" />}     label="Durée moyenne" value={formatDuration(metrics.avgDurationSeconds)} />
                </div>
            )}

            {metrics && metrics.topPostesOverdue.length > 0 && (
                <div className="bg-white rounded-lg border p-4">
                    <p className="text-sm text-gray-500 mb-2">Top postes en retard (&gt; 24h)</p>
                    <ul className="space-y-1">
                        {metrics.topPostesOverdue.map((p) => (
                            <li key={p.posteId} className="flex justify-between text-sm">
                                <span className="text-gray-700 truncate">{p.posteName ?? p.posteId.slice(0, 8) + '...'}</span>
                                <span className="font-medium text-orange-600">{p.count} en attente</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex gap-3 flex-wrap">
                {(['', 'pending', 'done'] as const).map((s) => (
                    <button
                        key={s}
                        onClick={() => { setStatusFilter(s); setPage(1); }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                    >
                        {s === '' ? 'Tous' : STATUS_LABELS[s as CallTaskStatus]}
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-lg border overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Client</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Poste</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Batch</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Durée</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={6} className="py-12 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline-block mr-2" />Chargement...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td colSpan={6} className="py-12 text-center text-gray-400">Aucun appel pour cette catégorie</td></tr>
                        ) : items.map((row) => (
                            <tr key={row.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-900">
                                    {row.clientPhone ?? <span className="text-gray-400">—</span>}
                                </td>
                                <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                                    {row.posteName ?? (row.posteId ? row.posteId.slice(0, 8) + '...' : '—')}
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                    #{row.batchNumber}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status]}`}>
                                        {STATUS_LABELS[row.status]}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                    {formatDuration(row.durationSeconds)}
                                </td>
                                <td className="px-4 py-3 text-gray-600 text-xs">
                                    {row.completedAt
                                        ? `${formatDate(row.completedAt)} ${formatTime(row.completedAt)}`
                                        : formatDate(row.createdAt)}
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
