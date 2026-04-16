"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { PlusCircle, Trash2, Edit, AlertTriangle, Shield } from 'lucide-react';
import { SlaRule, SlaMetric, SlaSeverity } from '@/app/lib/definitions';
import { getSlaRules, createSlaRule, updateSlaRule, deleteSlaRule } from '@/app/lib/api/sla.api';
import { useToast } from '@/app/ui/ToastProvider';
import { Spinner } from '@/app/ui/Spinner';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';

const METRIC_LABELS: Record<SlaMetric, string> = {
  first_response: 'Première réponse',
  resolution: 'Résolution',
  reengagement: 'Réengagement',
};

const SEVERITY_CONFIG: Record<SlaSeverity, { label: string; className: string }> = {
  warning: { label: 'Avertissement', className: 'bg-yellow-100 text-yellow-700' },
  breach: { label: 'Violation', className: 'bg-red-100 text-red-700' },
};

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

const DEFAULT_FORM = {
  name: '',
  metric: 'first_response' as SlaMetric,
  threshold_seconds: 300,
  severity: 'warning' as SlaSeverity,
  notify_admin: true,
};

export default function SlaView() {
  const [rules, setRules] = useState<SlaRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SlaRule | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setRules(await getSlaRules(TENANT_ID)); }
    catch { addToast({ message: 'Erreur chargement règles SLA', type: 'error' }); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
  };

  const openEdit = (r: SlaRule) => {
    setEditing(r);
    setForm({ name: r.name, metric: r.metric, threshold_seconds: r.threshold_seconds, severity: r.severity, notify_admin: r.notify_admin });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await updateSlaRule(editing.id, TENANT_ID, { name: form.name, threshold_seconds: form.threshold_seconds, severity: form.severity, notify_admin: form.notify_admin });
        addToast({ message: 'Règle mise à jour', type: 'success' });
      } else {
        await createSlaRule({ tenant_id: TENANT_ID, ...form });
        addToast({ message: 'Règle créée', type: 'success' });
      }
      setShowForm(false);
      void load();
    } catch (e: unknown) {
      addToast({ message: e instanceof Error ? e.message : 'Erreur', type: 'error' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (r: SlaRule) => {
    if (!confirm(`Supprimer la règle "${r.name}" ?`)) return;
    try {
      await deleteSlaRule(r.id, TENANT_ID);
      addToast({ message: 'Règle supprimée', type: 'success' });
      void load();
    } catch { addToast({ message: 'Erreur suppression', type: 'error' }); }
  };

  // Convert human-friendly input (minutes) to seconds for the form display
  const thresholdMinutes = Math.round(form.threshold_seconds / 60);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Règles SLA</h2>
          <p className="text-sm text-gray-500 mt-1">Définissez les seuils de temps de réponse et alertes</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
          <PlusCircle className="w-4 h-4" /> Nouvelle règle
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">{editing ? 'Modifier la règle' : 'Nouvelle règle SLA'}</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Réponse < 5min" />
            </div>

            {!editing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Métrique</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value as SlaMetric }))}>
                  {(Object.entries(METRIC_LABELS) as [SlaMetric, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seuil (minutes)</label>
              <input
                type="number"
                min={1}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={thresholdMinutes}
                onChange={e => setForm(f => ({ ...f, threshold_seconds: parseInt(e.target.value) * 60 || 60 }))}
              />
              <p className="text-xs text-gray-400 mt-1">= {fmtDuration(form.threshold_seconds)}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sévérité</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as SlaSeverity }))}>
                <option value="warning">Avertissement</option>
                <option value="breach">Violation</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="notify" checked={form.notify_admin} onChange={e => setForm(f => ({ ...f, notify_admin: e.target.checked }))} />
              <label htmlFor="notify" className="text-sm text-gray-700">Notifier l'administrateur</label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.name} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Shield className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucune règle SLA</p>
            <p className="text-sm mt-1">Créez votre première règle pour surveiller les délais</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Métrique</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Seuil</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Sévérité</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Notification</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map(r => {
                  const sv = SEVERITY_CONFIG[r.severity];
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 text-sm">{r.name}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{METRIC_LABELS[r.metric]}</td>
                      <td className="px-4 py-3 text-gray-900 text-sm font-mono">{fmtDuration(r.threshold_seconds)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${sv.className}`}>
                          <AlertTriangle className="w-3 h-3" /> {sv.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {r.notify_admin ? <span className="text-green-600 text-xs font-medium">Oui</span> : <span className="text-gray-400 text-xs">Non</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(r)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
