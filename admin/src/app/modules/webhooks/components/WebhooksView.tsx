"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { PlusCircle, Trash2, Edit, Webhook, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { OutboundWebhook, OutboundWebhookLog, WebhookDeliveryStatus } from '@/app/lib/definitions';
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook, getWebhookLogs, testWebhook } from '@/app/lib/api/outbound-webhooks.api';
import { useToast } from '@/app/ui/ToastProvider';
import { Spinner } from '@/app/ui/Spinner';
import { formatDateShort } from '@/app/lib/dateUtils';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';

const AVAILABLE_EVENTS = [
  'message.received', 'message.sent', 'message.delivered', 'message.read',
  'conversation.opened', 'conversation.closed', 'conversation.assigned',
  'contact.created', 'contact.updated',
  'label.added', 'label.removed',
  'sla.breach', 'sla.warning',
];

const STATUS_ICON: Record<WebhookDeliveryStatus, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-500" />,
  failed:  <XCircle className="w-4 h-4 text-red-500" />,
  pending: <AlertCircle className="w-4 h-4 text-yellow-500" />,
  retrying: <AlertCircle className="w-4 h-4 text-orange-500" />,
};

const DEFAULT_FORM = { name: '', url: '', events: [] as string[], secret: '', max_retries: 3 };

export default function WebhooksView() {
  const [webhooks, setWebhooks] = useState<OutboundWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OutboundWebhook | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<OutboundWebhookLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setWebhooks(await getWebhooks(TENANT_ID)); }
    catch { addToast({ message: 'Erreur chargement webhooks', type: 'error' }); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
  };

  const openEdit = (w: OutboundWebhook) => {
    setEditing(w);
    setForm({ name: w.name, url: w.url, events: [...w.events], secret: '', max_retries: w.max_retries });
    setShowForm(true);
  };

  const toggleEvent = (ev: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter(x => x !== ev) : [...f.events, ev],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await updateWebhook(editing.id, TENANT_ID, { name: form.name, url: form.url, events: form.events, max_retries: form.max_retries });
        addToast({ message: 'Webhook mis à jour', type: 'success' });
      } else {
        await createWebhook({ tenant_id: TENANT_ID, name: form.name, url: form.url, events: form.events, secret: form.secret || undefined, max_retries: form.max_retries });
        addToast({ message: 'Webhook créé', type: 'success' });
      }
      setShowForm(false);
      void load();
    } catch (e: unknown) {
      addToast({ message: e instanceof Error ? e.message : 'Erreur', type: 'error' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (w: OutboundWebhook) => {
    if (!confirm(`Supprimer le webhook "${w.name}" ?`)) return;
    try {
      await deleteWebhook(w.id, TENANT_ID);
      addToast({ message: 'Webhook supprimé', type: 'success' });
      void load();
    } catch { addToast({ message: 'Erreur suppression', type: 'error' }); }
  };

  const handleTest = async (w: OutboundWebhook) => {
    try {
      const result = await testWebhook(w.id, TENANT_ID);
      if (result.error) addToast({ message: `Erreur test: ${result.error}`, type: 'error' });
      else addToast({ message: `Test OK — HTTP ${result.status}`, type: 'success' });
    } catch { addToast({ message: 'Erreur test webhook', type: 'error' }); }
  };

  const toggleLogs = async (id: string) => {
    if (expandedLogs === id) { setExpandedLogs(null); return; }
    setExpandedLogs(id);
    setLogsLoading(true);
    try { setLogs(await getWebhookLogs(id)); }
    catch { addToast({ message: 'Erreur chargement logs', type: 'error' }); }
    finally { setLogsLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Webhooks sortants</h2>
          <p className="text-sm text-gray-500 mt-1">Envoyez des événements à des services externes</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
          <PlusCircle className="w-4 h-4" /> Nouveau webhook
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">{editing ? 'Modifier le webhook' : 'Nouveau webhook'}</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: CRM Intégration" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." />
            </div>

            {!editing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secret HMAC (optionnel)</label>
                <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} placeholder="Clé secrète..." />
                <p className="text-xs text-gray-400 mt-1">Utilisé pour signer les requêtes (X-Signature-256)</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tentatives max</label>
              <input type="number" min={0} max={10} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.max_retries} onChange={e => setForm(f => ({ ...f, max_retries: parseInt(e.target.value) || 0 }))} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Événements à écouter *</label>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto border rounded-lg p-3">
                {AVAILABLE_EVENTS.map(ev => (
                  <label key={ev} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} className="w-3.5 h-3.5" />
                    <span className="text-xs text-gray-700 font-mono">{ev}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.url || form.events.length === 0} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Webhook className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun webhook configuré</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {webhooks.map(w => (
              <div key={w.id}>
                <div className="p-5 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-semibold text-gray-900">{w.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${w.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {w.is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-mono mb-2 truncate">{w.url}</p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {w.events.map(ev => (
                          <span key={ev} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{ev}</span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400">{formatDateShort(w.createdAt)} · max {w.max_retries} tentatives</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => handleTest(w)} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">
                        <Play className="w-3 h-3" /> Test
                      </button>
                      <button onClick={() => toggleLogs(w.id)} className="text-gray-400 hover:text-gray-600 p-1">
                        {expandedLogs === w.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEdit(w)} className="text-gray-400 hover:text-blue-600"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(w)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>

                {expandedLogs === w.id && (
                  <div className="bg-gray-50 border-t border-gray-100 px-5 py-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Derniers envois</p>
                    {logsLoading ? (
                      <Spinner />
                    ) : logs.length === 0 ? (
                      <p className="text-xs text-gray-400">Aucun envoi enregistré</p>
                    ) : (
                      <div className="space-y-1">
                        {logs.slice(0, 10).map(log => (
                          <div key={log.id} className="flex items-center gap-3 text-xs">
                            {STATUS_ICON[log.status]}
                            <span className="font-mono text-gray-600">{log.event}</span>
                            <span className="text-gray-400">{log.response_status ? `HTTP ${log.response_status}` : '—'}</span>
                            {log.error && <span className="text-red-500 truncate max-w-[200px]">{log.error}</span>}
                            <span className="text-gray-300 ml-auto">{formatDateShort(log.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
