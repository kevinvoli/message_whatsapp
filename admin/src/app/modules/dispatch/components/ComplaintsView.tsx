"use client";

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertOctagon, CheckCircle, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, User,
} from 'lucide-react';
import { formatDate } from '@/app/lib/dateUtils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

type ComplaintStatus   = 'ouverte' | 'assignee' | 'en_traitement' | 'resolue' | 'rejetee';
type ComplaintCategory = 'commande_non_livree' | 'erreur_produit' | 'code_expedition_non_recu' | 'plainte_livreur' | 'plainte_commerciale' | 'plainte_utilisation_produit';
type ComplaintPriority = 'normale' | 'haute' | 'critique';

interface Complaint {
  id:              string;
  category:        ComplaintCategory;
  priority:        ComplaintPriority;
  status:          ComplaintStatus;
  description:     string;
  commercialName:  string | null;
  assignedToName:  string | null;
  resolutionNote:  string | null;
  resolvedAt:      string | null;
  createdAt:       string;
}

interface Stats {
  byStatus:       Record<ComplaintStatus, number>;
  byCategory:     Record<ComplaintCategory, number>;
  byCritiqueOpen: number;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  ouverte:       'Ouverte',
  assignee:      'Assignée',
  en_traitement: 'En traitement',
  resolue:       'Résolue',
  rejetee:       'Rejetée',
};

const STATUS_COLORS: Record<ComplaintStatus, string> = {
  ouverte:       'bg-red-100 text-red-700',
  assignee:      'bg-orange-100 text-orange-700',
  en_traitement: 'bg-blue-100 text-blue-700',
  resolue:       'bg-green-100 text-green-700',
  rejetee:       'bg-gray-100 text-gray-500',
};

const PRIORITY_COLORS: Record<ComplaintPriority, string> = {
  normale:  'text-gray-500',
  haute:    'text-orange-600 font-semibold',
  critique: 'text-red-600 font-bold',
};

const CAT_LABELS: Record<ComplaintCategory, string> = {
  commande_non_livree:         'Commande non livrée',
  erreur_produit:              'Erreur produit',
  code_expedition_non_recu:    'Code expédition manquant',
  plainte_livreur:             'Livreur',
  plainte_commerciale:         'Commerciale',
  plainte_utilisation_produit: 'Utilisation produit',
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function loadComplaints(status?: ComplaintStatus, priority?: ComplaintPriority, offset = 0) {
  const p = new URLSearchParams({ limit: '30', offset: String(offset) });
  if (status)   p.set('status', status);
  if (priority) p.set('priority', priority);
  const res = await fetch(`${API_BASE_URL}/admin/complaints?${p}`, { credentials: 'include' });
  if (!res.ok) return { items: [], total: 0 };
  return res.json() as Promise<{ items: Complaint[]; total: number }>;
}

async function loadStats(): Promise<Stats | null> {
  const res = await fetch(`${API_BASE_URL}/admin/complaints/stats`, { credentials: 'include' });
  if (!res.ok) return null;
  return res.json() as Promise<Stats>;
}

async function patchComplaint(id: string, action: string, body: object): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/admin/complaints/${id}/${action}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ComplaintsView() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [total, setTotal]           = useState(0);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [filterStatus,   setFilterStatus]   = useState<ComplaintStatus | ''>('ouverte');
  const [filterPriority, setFilterPriority] = useState<ComplaintPriority | ''>('');
  const [loading, setLoading]       = useState(false);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [acting, setActing]         = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [data, s] = await Promise.all([
      loadComplaints(filterStatus || undefined, filterPriority || undefined),
      loadStats(),
    ]);
    setComplaints(data.items);
    setTotal(data.total);
    setStats(s);
    setLoading(false);
  }, [filterStatus, filterPriority]);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: string, body: object = {}) => {
    setActing(id); setError(null);
    const ok = await patchComplaint(id, action, body);
    if (!ok) setError(`Erreur lors de l'action "${action}".`);
    else { setExpanded(null); setResolutionNote(''); await load(); }
    setActing(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-red-600" />
          <h3 className="text-base font-bold text-gray-900">Plaintes clients</h3>
          {(stats?.byCritiqueOpen ?? 0) > 0 && (
            <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">
              {stats!.byCritiqueOpen} critique{stats!.byCritiqueOpen > 1 ? 's' : ''} ouvert{stats!.byCritiqueOpen > 1 ? 'es' : 'e'}
            </span>
          )}
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats par statut */}
      {stats && (
        <div className="grid grid-cols-5 gap-1.5">
          {(Object.entries(STATUS_LABELS) as [ComplaintStatus, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setFilterStatus(k)}
              className={`rounded-lg px-2 py-1.5 text-center border transition-colors ${filterStatus === k ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
              <p className="text-sm font-bold text-gray-800">{stats.byStatus[k] ?? 0}</p>
              <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500">Priorité :</span>
        {(['', 'normale', 'haute', 'critique'] as const).map((p) => (
          <button key={p} onClick={() => setFilterPriority(p as ComplaintPriority | '')}
            className={`text-xs px-2 py-1 rounded-full border ${filterPriority === p ? 'bg-gray-700 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {p === '' ? `Toutes (${total})` : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Liste */}
      <div className="space-y-2">
        {complaints.length === 0 && !loading && (
          <p className="text-sm text-gray-400 text-center py-6">Aucune plainte trouvée.</p>
        )}
        {complaints.map((c) => {
          const isOpen = expanded === c.id;
          return (
            <div key={c.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <button
                onClick={() => { setExpanded(isOpen ? null : c.id); setError(null); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium ${PRIORITY_COLORS[c.priority]}`}>
                      {c.priority.toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-gray-800 truncate">{CAT_LABELS[c.category]}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {c.description.slice(0, 80)}{c.description.length > 80 ? '…' : ''}
                  </p>
                  <p className="text-xs text-gray-400">
                    Par {c.commercialName ?? '—'} · {formatDate(c.createdAt)}
                    {c.assignedToName && <span className="ml-2">→ {c.assignedToName}</span>}
                  </p>
                </div>
                {c.status === 'resolue' && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
                  <p className="text-sm text-gray-700">{c.description}</p>

                  {c.resolutionNote && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                      <span className="font-semibold">Résolution : </span>{c.resolutionNote}
                    </div>
                  )}
                  {c.resolvedAt && (
                    <p className="text-xs text-gray-400">Clôturée le {formatDate(c.resolvedAt)}</p>
                  )}

                  {/* Actions selon statut */}
                  {c.status === 'ouverte' && (
                    <button
                      onClick={() => void act(c.id, 'assign', { assignedTo: 'admin', assignedToName: 'Admin' })}
                      disabled={acting === c.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                    >
                      <User className="w-3 h-3" />
                      Prendre en charge
                    </button>
                  )}

                  {c.status === 'assignee' && (
                    <button
                      onClick={() => void act(c.id, 'start')}
                      disabled={acting === c.id}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                    >
                      Démarrer le traitement
                    </button>
                  )}

                  {(c.status === 'assignee' || c.status === 'en_traitement') && (
                    <div className="space-y-2">
                      <textarea
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        placeholder="Note de résolution…"
                        rows={2}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-green-300"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void act(c.id, 'resolve', { resolutionNote })}
                          disabled={acting === c.id || !resolutionNote.trim()}
                          className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                        >
                          {acting === c.id ? '…' : 'Résoudre'}
                        </button>
                        <button
                          onClick={() => void act(c.id, 'reject', { resolutionNote: resolutionNote || undefined })}
                          disabled={acting === c.id}
                          className="flex-1 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                        >
                          {acting === c.id ? '…' : 'Rejeter'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
