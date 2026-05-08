'use client';

import { useEffect, useState } from 'react';
import { Loader2, Smartphone, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  CallDevice,
  getCallDevices,
  updateCallDevice,
  dissociateCallDevice,
} from '../lib/api/integration.api';
import { getPostes } from '../lib/api/postes.api';
import { Poste } from '../lib/definitions';
import { formatDate } from '../lib/dateUtils';

type FilterType = 'all' | 'associated' | 'unassociated';

export default function CallDevicesView() {
  const [devices, setDevices]   = useState<CallDevice[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<FilterType>('all');
  const [edits, setEdits]       = useState<Record<string, { label: string; posteId: string }>>({});
  const [saving, setSaving]     = useState<Record<string, boolean>>({});
  const [saved, setSaved]       = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([getCallDevices(), getPostes()])
      .then(([devs, pts]) => {
        setDevices(devs);
        setPostes(pts);
        const initialEdits: Record<string, { label: string; posteId: string }> = {};
        for (const d of devs) {
          initialEdits[d.deviceId] = { label: d.label ?? '', posteId: d.posteId ?? '' };
        }
        setEdits(initialEdits);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredDevices = devices.filter((d) => {
    if (filter === 'associated')   return d.posteId != null;
    if (filter === 'unassociated') return d.posteId == null;
    return true;
  });

  const handleSave = async (deviceId: string) => {
    const edit = edits[deviceId];
    if (!edit) return;
    setSaving((s) => ({ ...s, [deviceId]: true }));
    try {
      const updated = await updateCallDevice(deviceId, {
        label:   edit.label.trim() || null,
        posteId: edit.posteId || null,
      });
      setDevices((prev) => prev.map((d) => (d.deviceId === deviceId ? updated : d)));
      setSaved((s) => ({ ...s, [deviceId]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [deviceId]: false })), 2000);
    } finally {
      setSaving((s) => ({ ...s, [deviceId]: false }));
    }
  };

  const handleDissociate = async (deviceId: string) => {
    setSaving((s) => ({ ...s, [deviceId]: true }));
    try {
      const updated = await dissociateCallDevice(deviceId);
      setDevices((prev) => prev.map((d) => (d.deviceId === deviceId ? updated : d)));
      setEdits((e) => ({ ...e, [deviceId]: { ...e[deviceId], posteId: '' } }));
    } finally {
      setSaving((s) => ({ ...s, [deviceId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement des appareils…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Appareils telephoniques ({devices.length})
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Appareils detectes via call_logs DB2. Associez chaque appareil a un poste pour
            activer le fallback device&amp;rarr;poste dans le matching des obligations.
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-xs font-medium">
          {(['all', 'unassociated', 'associated'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                'px-3 py-1.5 rounded-md transition-colors',
                filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {f === 'all' ? 'Tous' : f === 'unassociated' ? 'Non associes' : 'Associes'}
            </button>
          ))}
        </div>
      </div>

      {filteredDevices.length === 0 ? (
        <div className="flex items-center gap-3 p-6 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-500">
          <Smartphone className="w-5 h-5 flex-shrink-0" />
          {devices.length === 0
            ? 'Aucun appareil detecte. Lancez une sync DB2 pour decouvrir les appareils.'
            : 'Aucun appareil dans ce filtre.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Device ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Label</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Poste associe</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Statut</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Derniere activite</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Appels</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDevices.map((device) => {
                const edit     = edits[device.deviceId] ?? { label: '', posteId: '' };
                const isSaving = saving[device.deviceId] ?? false;
                const isDone   = saved[device.deviceId] ?? false;
                const isDirty  =
                  edit.label   !== (device.label ?? '') ||
                  edit.posteId !== (device.posteId ?? '');
                return (
                  <tr key={device.deviceId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{device.deviceId}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={edit.label}
                        placeholder="Ex: Poste Bureau 12"
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [device.deviceId]: { ...prev[device.deviceId], label: e.target.value },
                          }))
                        }
                        className="w-full min-w-[140px] border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={edit.posteId}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [device.deviceId]: { ...prev[device.deviceId], posteId: e.target.value },
                            }))
                          }
                          className="border border-gray-300 rounded-lg px-2 py-1 text-xs min-w-[160px] focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="">-- Aucun poste --</option>
                          {postes.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.code})
                            </option>
                          ))}
                        </select>
                        {device.posteId && (
                          <button
                            onClick={() => void handleDissociate(device.deviceId)}
                            disabled={isSaving}
                            className="text-xs text-red-500 hover:underline disabled:opacity-50"
                          >
                            Dissocier
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {device.posteId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3" /> Associe
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <AlertTriangle className="w-3 h-3" /> Non associe
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {device.lastSeen ? formatDate(device.lastSeen) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {device.callCount.toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void handleSave(device.deviceId)}
                        disabled={isSaving || !isDirty}
                        className={[
                          'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                          isDone
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed',
                        ].join(' ')}
                      >
                        {isSaving
                          ? <><Loader2 className="w-3 h-3 animate-spin" /> Sauvegarde…</>
                          : isDone
                          ? <><CheckCircle className="w-3 h-3" /> Enregistre</>
                          : 'Enregistrer'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
