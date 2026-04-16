"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Send, Pause, X, BarChart3, PlusCircle, PlayCircle } from 'lucide-react';
import { Broadcast, BroadcastStatus } from '@/app/lib/definitions';
import { getBroadcasts, createBroadcast, launchBroadcast, pauseBroadcast, cancelBroadcast } from '@/app/lib/api/broadcasts.api';
import { useToast } from '@/app/ui/ToastProvider';
import { Spinner } from '@/app/ui/Spinner';
import { formatDateShort } from '@/app/lib/dateUtils';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';

const STATUS_CONFIG: Record<BroadcastStatus, { label: string; className: string }> = {
  DRAFT:      { label: 'Brouillon',    className: 'bg-gray-100 text-gray-600' },
  SCHEDULED:  { label: 'Planifié',     className: 'bg-blue-100 text-blue-700' },
  RUNNING:    { label: 'En cours',     className: 'bg-green-100 text-green-700' },
  PAUSED:     { label: 'Pausé',        className: 'bg-yellow-100 text-yellow-700' },
  COMPLETED:  { label: 'Terminé',      className: 'bg-emerald-100 text-emerald-700' },
  CANCELLED:  { label: 'Annulé',       className: 'bg-red-100 text-red-600' },
  FAILED:     { label: 'Échoué',       className: 'bg-red-100 text-red-700' },
};

export default function BroadcastsView() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setBroadcasts(await getBroadcasts(TENANT_ID)); }
    catch { addToast({ message: 'Erreur chargement broadcasts', type: 'error' }); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createBroadcast({ tenant_id: TENANT_ID, name: form.name });
      addToast({ message: 'Broadcast créé', type: 'success' });
      setShowForm(false);
      void load();
    } catch (e: unknown) {
      addToast({ message: e instanceof Error ? e.message : 'Erreur', type: 'error' });
    } finally { setSaving(false); }
  };

  const handleLaunch = async (id: string) => {
    try { await launchBroadcast(id, TENANT_ID); addToast({ message: 'Broadcast lancé', type: 'success' }); void load(); }
    catch { addToast({ message: 'Erreur lancement', type: 'error' }); }
  };

  const handlePause = async (id: string) => {
    try { await pauseBroadcast(id, TENANT_ID); addToast({ message: 'Broadcast pausé', type: 'success' }); void load(); }
    catch { addToast({ message: 'Erreur pause', type: 'error' }); }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Annuler ce broadcast ?')) return;
    try { await cancelBroadcast(id, TENANT_ID); addToast({ message: 'Broadcast annulé', type: 'success' }); void load(); }
    catch { addToast({ message: 'Erreur annulation', type: 'error' }); }
  };

  const pct = (v: number, total: number) => total > 0 ? Math.round(v / total * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Broadcasts</h2>
          <p className="text-sm text-gray-500 mt-1">Envois en masse via templates HSM WhatsApp</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
          <PlusCircle className="w-4 h-4" /> Nouveau broadcast
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-semibold">Nouveau broadcast</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm({ name: e.target.value })} placeholder="Ex: Promo Ramadan 2026" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
              <button onClick={handleCreate} disabled={saving || !form.name} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : broadcasts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Send className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun broadcast</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {broadcasts.map(b => {
              const s = STATUS_CONFIG[b.status];
              return (
                <div key={b.id} className="p-5 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-semibold text-gray-900">{b.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.className}`}>{s.label}</span>
                      </div>
                      {b.total_recipients > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>Total : {b.total_recipients}</span>
                            <span>Envoyés : {b.sent_count} ({pct(b.sent_count, b.total_recipients)}%)</span>
                            <span>Livrés : {b.delivered_count} ({pct(b.delivered_count, b.total_recipients)}%)</span>
                            <span>Lus : {b.read_count} ({pct(b.read_count, b.total_recipients)}%)</span>
                            {b.failed_count > 0 && <span className="text-red-500">Échecs : {b.failed_count}</span>}
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct(b.sent_count, b.total_recipients)}%` }} />
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-2">{formatDateShort(b.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {b.status === 'DRAFT' && (
                        <button onClick={() => handleLaunch(b.id)} className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">
                          <PlayCircle className="w-3.5 h-3.5" /> Lancer
                        </button>
                      )}
                      {b.status === 'RUNNING' && (
                        <button onClick={() => handlePause(b.id)} className="flex items-center gap-1 text-xs bg-yellow-500 text-white px-3 py-1.5 rounded-lg hover:bg-yellow-600">
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </button>
                      )}
                      {['DRAFT', 'RUNNING', 'PAUSED', 'SCHEDULED'].includes(b.status) && (
                        <button onClick={() => handleCancel(b.id)} className="text-gray-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
