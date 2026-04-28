'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  LogIn,
  Monitor,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Wifi,
} from 'lucide-react';
import { formatDate } from '@/app/lib/dateUtils';
import { getLoginLogs, purgeLoginLogs, LoginLogEntry } from '@/app/lib/api/login-log.api';

const OTP_BADGE: Record<string, { label: string; cls: string }> = {
  none:     { label: 'Sans OTP',  cls: 'bg-gray-100 text-gray-600'   },
  sent:     { label: 'OTP envoyé', cls: 'bg-blue-100 text-blue-700'  },
  verified: { label: 'Vérifié',   cls: 'bg-green-100 text-green-700' },
  failed:   { label: 'Échec OTP', cls: 'bg-red-100 text-red-700'    },
};

export default function LoginLogsView() {
  const [logs, setLogs]         = useState<LoginLogEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [offset, setOffset]     = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLoginLogs({ user_id: search || undefined, limit: LIMIT, offset });
      setLogs(res.data);
      setTotal(res.total);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [search, offset]);

  useEffect(() => { void load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    void load();
  };

  const handlePurge = async () => {
    if (!confirm('Supprimer les entrées de plus de 90 jours ?')) return;
    const res = await purgeLoginLogs(90);
    alert(`${res.deleted} entrée(s) supprimée(s).`);
    void load();
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Journal des connexions</h1>
              <p className="text-sm text-gray-500">{total} entrée(s) au total</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void load()}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            <button
              onClick={() => void handlePurge()}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100"
            >
              <Trash2 className="w-4 h-4" />
              Purger &gt;90j
            </button>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par user_id…"
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
          >
            Filtrer
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Chargement…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Aucune connexion enregistrée.
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Commercial</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">IP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Appareil</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Localisation</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">OTP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => {
                    const otp = OTP_BADGE[log.otpStatus] ?? OTP_BADGE.none;
                    return (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-gray-700">
                            <LogIn className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            {formatDate(log.loginAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{log.userName ?? '—'}</p>
                          <p className="text-xs text-gray-400 font-mono">{log.userId.slice(0, 8)}…</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-gray-600 font-mono text-xs">
                            <Wifi className="w-3 h-3 text-gray-400" />
                            {log.ip ?? '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <Monitor className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="truncate text-xs" title={log.device ?? undefined}>
                              {log.device ?? '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {log.localisation ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${otp.cls}`}>
                            {otp.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-500">
                  {offset + 1}–{Math.min(offset + LIMIT, total)} sur {total}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    Précédent
                  </button>
                  <button
                    disabled={offset + LIMIT >= total}
                    onClick={() => setOffset(offset + LIMIT)}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
