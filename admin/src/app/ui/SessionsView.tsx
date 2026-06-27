'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Clock, Users, Timer } from 'lucide-react';
import { getSessions } from '@/app/lib/api/commercial-groups.api';
import { getPresence } from '@/app/lib/api/commerciaux.api';
import { SessionRow, SessionsKpis, CommercialPresenceItem } from '@/app/lib/definitions';
import { formatTime } from '@/app/lib/dateUtils';
import { Spinner } from '@/app/ui/Spinner';

type StatusFilter = 'all' | 'active' | 'closed';

const PAGE_LIMIT = 50;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTotalMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}

function KpiCard({ title, value, icon, highlight }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${highlight ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
        <p className={`text-2xl font-bold ${highlight ? 'text-green-700' : 'text-gray-900'}`}>{value}</p>
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  status: 'active' | 'closed';
}

function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      Fermée
    </span>
  );
}

interface SessionTableProps {
  sessions: SessionRow[];
  loading: boolean;
}

function SessionTable({ sessions, loading }: SessionTableProps) {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Commercial</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Connexion</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Déconnexion</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Durée</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {sessions.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                Aucune session sur cette période.
              </td>
            </tr>
          ) : (
            sessions.map((session) => (
              <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{session.commercialName}</td>
                <td className="px-4 py-3 text-gray-600">{formatTime(session.loginAt)}</td>
                <td className="px-4 py-3 text-gray-600">
                  {session.logoutAt ? formatTime(session.logoutAt) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDuration(session.durationMinutes)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={session.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationBarProps {
  page: number;
  total: number;
  limit: number;
  onPrev: () => void;
  onNext: () => void;
}

function PaginationBar({ page, total, limit, onPrev, onNext }: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between text-sm text-gray-500">
      <span>Page {page} · {total} résultat{total !== 1 ? 's' : ''}</span>
      <div className="flex gap-2">
        <button
          onClick={onPrev}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Précédent
        </button>
        <button
          onClick={onNext}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Suivant
        </button>
      </div>
    </div>
  );
}

export default function SessionsView() {
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [commercialId, setCommercialId] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<SessionsKpis>({ activeSessions: 0, avgDurationMinutes: 0, totalConnectedMinutes: 0 });
  const [loading, setLoading] = useState(true);
  const [commerciaux, setCommerciaux] = useState<CommercialPresenceItem[]>([]);

  useEffect(() => {
    getPresence()
      .then(setCommerciaux)
      .catch(() => setCommerciaux([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    getSessions({
      date,
      commercialId: commercialId || undefined,
      status: statusFilter,
      page,
      limit: PAGE_LIMIT,
    })
      .then((res) => {
        setSessions(res.sessions);
        setTotal(res.total);
        setKpis(res.kpis);
      })
      .catch(() => {
        setSessions([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [date, commercialId, statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPage(1);
    setDate(e.target.value);
  };

  const handleCommercialChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPage(1);
    setCommercialId(e.target.value);
  };

  const handleStatusChange = (s: StatusFilter) => {
    setPage(1);
    setStatusFilter(s);
  };

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Toutes' },
    { value: 'active', label: 'Actives' },
    { value: 'closed', label: 'Fermées' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Sessions de connexion</h2>
          <p className="text-sm text-gray-500 mt-0.5">Historique des connexions commerciaux</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          aria-label="Actualiser les données"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Chargement…' : 'Actualiser'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Sessions actives"
          value={String(kpis.activeSessions)}
          icon={<Users size={18} />}
          highlight={kpis.activeSessions > 0}
        />
        <KpiCard
          title="Durée moyenne"
          value={kpis.avgDurationMinutes > 0 ? formatDuration(Math.round(kpis.avgDurationMinutes)) : '—'}
          icon={<Clock size={18} />}
        />
        <KpiCard
          title="Total connecté"
          value={kpis.totalConnectedMinutes > 0 ? formatTotalMinutes(kpis.totalConnectedMinutes) : '—'}
          icon={<Timer size={18} />}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Date
          <input
            type="date"
            value={date}
            onChange={handleDateChange}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Commercial
          <select
            value={commercialId}
            onChange={handleCommercialChange}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Tous les commerciaux</option>
            {commerciaux.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Statut</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SessionTable sessions={sessions} loading={loading} />

      {!loading && (
        <PaginationBar
          page={page}
          total={total}
          limit={PAGE_LIMIT}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
    </div>
  );
}
