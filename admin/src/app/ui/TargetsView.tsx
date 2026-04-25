'use client';

import { useEffect, useState } from 'react';
import { Commercial } from '../lib/definitions';
import { getCommerciaux } from '../lib/api/commerciaux.api';
import {
  CommercialTarget,
  TargetProgress,
  CreateTargetPayload,
  getTargets,
  getProgressAll,
  createTarget,
  updateTarget,
  deleteTarget,
} from '../lib/api/targets.api';

const METRIC_LABELS: Record<CommercialTarget['metric'], string> = {
  conversations: 'Conversations',
  calls: 'Appels',
  follow_ups: 'Relances effectuées',
  orders: 'Commandes',
  relances: 'Relances (alt)',
  reports_submitted: 'Rapports soumis (GICOP)',
};

const PERIOD_LABELS: Record<CommercialTarget['period_type'], string> = {
  day: 'Journée',
  week: 'Semaine',
  month: 'Mois',
  quarter: 'Trimestre',
};

function colorForPct(pct: number) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 70) return 'bg-blue-500';
  if (pct >= 40) return 'bg-yellow-400';
  return 'bg-red-400';
}

export default function TargetsView() {
  const [tab, setTab] = useState<'list' | 'progress'>('progress');
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [targets, setTargets] = useState<CommercialTarget[]>([]);
  const [progress, setProgress] = useState<TargetProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CommercialTarget | null>(null);
  const [form, setForm] = useState<CreateTargetPayload>({
    commercial_id: '',
    period_type: 'month',
    period_start: new Date().toISOString().slice(0, 10),
    metric: 'conversations',
    target_value: 50,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getCommerciaux(), getTargets(), getProgressAll()])
      .then(([c, t, p]) => {
        setCommerciaux(c);
        setTargets(t);
        setProgress(p);
      })
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      commercial_id: commerciaux[0]?.id ?? '',
      period_type: 'month',
      period_start: new Date().toISOString().slice(0, 10),
      metric: 'conversations',
      target_value: 50,
    });
    setError('');
    setShowModal(true);
  };

  const openEdit = (t: CommercialTarget) => {
    setEditing(t);
    setForm({
      commercial_id: t.commercial_id,
      commercial_name: t.commercial_name ?? undefined,
      period_type: t.period_type,
      period_start: t.period_start,
      metric: t.metric,
      target_value: t.target_value,
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.commercial_id || form.target_value <= 0) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setSaving(true);
    try {
      const comm = commerciaux.find((c) => c.id === form.commercial_id);
      const payload = { ...form, commercial_name: comm?.name };
      if (editing) {
        const updated = await updateTarget(editing.id, payload);
        setTargets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const created = await createTarget(payload);
        setTargets((prev) => [...prev, created]);
      }
      setProgress(await getProgressAll());
      setShowModal(false);
    } catch (e: any) {
      setError(e.message ?? 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet objectif ?')) return;
    await deleteTarget(id);
    setTargets((prev) => prev.filter((t) => t.id !== id));
    setProgress((prev) => prev.filter((p) => p.target.id !== id));
  };

  if (loading) return <div className="p-6 text-gray-500">Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Objectifs commerciaux</h2>
        <button
          onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          + Nouvel objectif
        </button>
      </div>

      <div className="flex gap-2">
        {(['progress', 'list'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t === 'progress' ? 'Progression' : 'Liste'}
          </button>
        ))}
      </div>

      {tab === 'progress' && (
        <div className="space-y-4">
          {progress.length === 0 && (
            <p className="text-gray-400 text-sm">Aucun objectif défini.</p>
          )}
          {progress.map((p) => (
            <div key={p.target.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-900">
                    {p.target.commercial_name ?? p.target.commercial_id}
                  </span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-sm text-gray-600">
                    {METRIC_LABELS[p.target.metric]} — {p.period_label}
                  </span>
                </div>
                <span
                  className={`text-sm font-bold ${
                    p.progress_pct >= 100 ? 'text-green-600' : 'text-gray-700'
                  }`}
                >
                  {p.current_value} / {p.target.target_value} ({p.progress_pct}%)
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${colorForPct(p.progress_pct)}`}
                  style={{ width: `${Math.min(p.progress_pct, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'list' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Commercial</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Période</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Métrique</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Objectif</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {targets.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{t.commercial_name ?? t.commercial_id}</td>
                  <td className="px-4 py-3">
                    {PERIOD_LABELS[t.period_type]} — {t.period_start}
                  </td>
                  <td className="px-4 py-3">{METRIC_LABELS[t.metric]}</td>
                  <td className="px-4 py-3 text-right font-medium">{t.target_value}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => openEdit(t)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-red-500 hover:underline text-xs"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
              {targets.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Aucun objectif défini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold">
              {editing ? "Modifier l'objectif" : 'Nouvel objectif'}
            </h3>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Commercial
                <select
                  value={form.commercial_id}
                  onChange={(e) => setForm((f) => ({ ...f, commercial_id: e.target.value }))}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {commerciaux.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Type de période
                <select
                  value={form.period_type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      period_type: e.target.value as CommercialTarget['period_type'],
                    }))
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {Object.entries(PERIOD_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Début de période
                <input
                  type="date"
                  value={form.period_start}
                  onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Métrique
                <select
                  value={form.metric}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      metric: e.target.value as CommercialTarget['metric'],
                    }))
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {Object.entries(METRIC_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Valeur cible
                <input
                  type="number"
                  min={1}
                  value={form.target_value}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, target_value: parseInt(e.target.value) || 1 }))
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Sauvegarde…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
