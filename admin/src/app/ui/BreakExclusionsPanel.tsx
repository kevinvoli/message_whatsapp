'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X, ShieldOff } from 'lucide-react';
import { BreakExclusion, Poste, CommercialPresenceItem } from '@/app/lib/definitions';
import { getExclusions, createExclusion, deleteExclusion } from '@/app/lib/api/commercial-groups.api';
import { getPostes } from '@/app/lib/api/postes.api';
import { getPresence } from '@/app/lib/api/commerciaux.api';

interface BreakExclusionsPanelProps {
  subGroupId: string;
  onClose: () => void;
}

type Scope = 'poste' | 'commercial';

export default function BreakExclusionsPanel({ subGroupId, onClose }: BreakExclusionsPanelProps) {
  const [exclusions, setExclusions]   = useState<BreakExclusion[]>([]);
  const [postes, setPostes]           = useState<Poste[]>([]);
  const [presence, setPresence]       = useState<CommercialPresenceItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [scope, setScope]             = useState<Scope>('commercial');
  const [targetId, setTargetId]       = useState('');
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [excl, p, po] = await Promise.all([
        getExclusions(subGroupId),
        getPresence(),
        getPostes(),
      ]);
      setExclusions(excl);
      setPresence(p);
      setPostes(po);
    } catch {
      setError('Impossible de charger les exclusions.');
    } finally {
      setLoading(false);
    }
  }, [subGroupId]);

  useEffect(() => { void load(); }, [load]);

  const handleScopeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setScope(e.target.value as Scope);
    setTargetId('');
  };

  const handleAdd = async () => {
    if (!targetId) { setError('Sélectionnez une cible.'); return; }
    setSaving(true);
    setError(null);
    try {
      await createExclusion({
        subGroupId,
        scope,
        posteId: scope === 'poste' ? targetId : null,
        commercialId: scope === 'commercial' ? targetId : null,
      });
      setTargetId('');
      void load();
    } catch {
      setError("Erreur lors de l'ajout de l'exclusion.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteExclusion(id);
      void load();
    } catch { /* silencieux */ }
    finally { setDeletingId(null); }
  };

  const resolveLabel = (excl: BreakExclusion): string => {
    if (excl.scope === 'poste' && excl.posteId) {
      const p = postes.find((x) => x.id === excl.posteId);
      return p ? `${p.name} (${p.code})` : excl.posteId;
    }
    if (excl.scope === 'commercial' && excl.commercialId) {
      const c = presence.find((x) => x.id === excl.commercialId);
      return c ? c.name : excl.commercialId;
    }
    return '-';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShieldOff className="w-5 h-5 text-orange-500" />
            <h3 className="text-base font-semibold text-gray-900">Exclusions de pause</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Fermer">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-16 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
            </div>
          ) : exclusions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Exclusions actives</p>
              {exclusions.map((excl) => (
                <div key={excl.id} className="flex items-center justify-between px-3 py-2 bg-orange-50 rounded-lg">
                  <div>
                    <span className="text-xs font-medium text-orange-700 uppercase mr-2">
                      {excl.scope === 'poste' ? 'Poste' : 'Commercial'}
                    </span>
                    <span className="text-sm text-gray-800">{resolveLabel(excl)}</span>
                  </div>
                  <button
                    onClick={() => void handleDelete(excl.id)}
                    disabled={deletingId === excl.id}
                    aria-label="Supprimer cette exclusion"
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                  >
                    {deletingId === excl.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-2">Aucune exclusion configurée.</p>
          )}

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ajouter une exclusion</p>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select
                value={scope}
                onChange={handleScopeChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 focus:outline-none"
              >
                <option value="commercial">Commercial</option>
                <option value="poste">Poste</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {scope === 'poste' ? 'Poste à exclure' : 'Commercial à exclure'}
              </label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                aria-label={scope === 'poste' ? 'Sélectionner un poste' : 'Sélectionner un commercial'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 focus:outline-none"
              >
                <option value="">-- Sélectionner --</option>
                {scope === 'poste'
                  ? postes.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))
                  : presence.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
              </select>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
            )}

            <button
              onClick={() => void handleAdd()}
              disabled={saving || !targetId}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Ajouter l&apos;exclusion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
