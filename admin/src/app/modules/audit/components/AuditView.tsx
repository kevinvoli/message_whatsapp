"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { AuditLog, AuditAction } from '@/app/lib/definitions';
import { getAuditLogs } from '@/app/lib/api/audit.api';
import { useToast } from '@/app/ui/ToastProvider';
import { Spinner } from '@/app/ui/Spinner';
import { formatDateShort } from '@/app/lib/dateUtils';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';
const PAGE_SIZE = 20;

const ACTION_CONFIG: Record<AuditAction, { label: string; className: string }> = {
  CREATE:       { label: 'Créé',       className: 'bg-green-100 text-green-700' },
  UPDATE:       { label: 'Modifié',    className: 'bg-blue-100 text-blue-700' },
  DELETE:       { label: 'Supprimé',   className: 'bg-red-100 text-red-700' },
  LOGIN:        { label: 'Connexion',  className: 'bg-gray-100 text-gray-700' },
  LOGOUT:       { label: 'Déconnexion', className: 'bg-gray-100 text-gray-600' },
  SEND_MESSAGE: { label: 'Message',    className: 'bg-purple-100 text-purple-700' },
  ASSIGN:       { label: 'Assigné',    className: 'bg-indigo-100 text-indigo-700' },
  TRANSFER:     { label: 'Transféré',  className: 'bg-cyan-100 text-cyan-700' },
  CLOSE:        { label: 'Fermé',      className: 'bg-orange-100 text-orange-700' },
  REOPEN:       { label: 'Réouvert',   className: 'bg-yellow-100 text-yellow-700' },
  EXPORT:       { label: 'Export',     className: 'bg-teal-100 text-teal-700' },
};

export default function AuditView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ actor_id: '', entity_type: '', action: '' });
  const { addToast } = useToast();

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await getAuditLogs({
        tenant_id: TENANT_ID,
        actor_id: filters.actor_id || undefined,
        entity_type: filters.entity_type || undefined,
        action: filters.action || undefined,
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
      });
      setLogs(res.items);
      setTotal(res.total);
    } catch {
      addToast({ message: 'Erreur chargement audit', type: 'error' });
    } finally { setLoading(false); }
  }, [addToast, filters]);

  useEffect(() => {
    setPage(0);
    void load(0);
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Journal d'audit</h2>
          <p className="text-sm text-gray-500 mt-1">Historique immuable de toutes les actions</p>
        </div>
        <span className="text-sm text-gray-400">{total} entrée{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm"
            placeholder="Acteur (ID)"
            value={filters.actor_id}
            onChange={e => setFilters(f => ({ ...f, actor_id: e.target.value }))}
          />
        </div>
        <input
          className="border rounded-lg px-3 py-2 text-sm w-40"
          placeholder="Entité (ex: Chat)"
          value={filters.entity_type}
          onChange={e => setFilters(f => ({ ...f, entity_type: e.target.value }))}
        />
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={filters.action}
          onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
        >
          <option value="">Toutes les actions</option>
          {Object.keys(ACTION_CONFIG).map(a => (
            <option key={a} value={a}>{ACTION_CONFIG[a as AuditAction].label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucune entrée</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Acteur</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Entité</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">ID entité</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(log => {
                    const ac = log.action && ACTION_CONFIG[log.action] ? ACTION_CONFIG[log.action] : { label: log.action, className: 'bg-gray-100 text-gray-700' };
                    return (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateShort(log.createdAt)}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-gray-900">{log.actor_name ?? '—'}</div>
                          <div className="text-xs text-gray-400">{log.actor_type}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ac.className}`}>{ac.label}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{log.entity_type ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.entity_id ? log.entity_id.slice(0, 8) + '…' : '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate">
                          {log.diff ? JSON.stringify(log.diff).slice(0, 80) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">Page {page + 1} / {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40">
                    <ChevronRight className="w-4 h-4" />
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
