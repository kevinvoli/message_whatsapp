"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Phone, CheckCircle, AlertTriangle, RefreshCw, XCircle, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { getSystemConfigs, updateSystemConfig } from '@/app/lib/api/system-config.api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const FLAG_KEY = 'FF_CALL_OBLIGATIONS_ENABLED';

interface CategoryProgress { done: number; required: number; }

interface ObligationStatus {
  batchId: string;
  batchNumber: number;
  status: 'pending' | 'complete';
  annulee:      CategoryProgress;
  livree:       CategoryProgress;
  sansCommande: CategoryProgress;
  qualityCheckPassed: boolean;
  readyForRotation: boolean;
}

interface PosteRow {
  posteId: string;
  posteName: string;
  obligation: ObligationStatus | null;
}

async function fetchObligation(posteId: string): Promise<ObligationStatus | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/call-obligations/poste/${posteId}`, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json() as ObligationStatus;
  } catch { return null; }
}

export default function CallObligationsView({ postes }: { postes: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<PosteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [confirmPending, setConfirmPending] = useState<boolean | null>(null); // valeur cible à confirmer

  const loadFlag = useCallback(async () => {
    try {
      const configs = await getSystemConfigs();
      const entry = configs.find((c) => c.configKey === FLAG_KEY);
      setEnabled(entry?.configValue === 'true');
    } catch { /* silencieux */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      postes.map(async (p) => ({
        posteId: p.id,
        posteName: p.name,
        obligation: await fetchObligation(p.id),
      })),
    );
    setRows(results);
    setLoading(false);
  }, [postes]);

  useEffect(() => {
    void loadFlag();
    void load();
  }, [load, loadFlag]);

  // OBL-007 — Demander confirmation avant de modifier le flag
  const handleToggleRequest = () => {
    if (toggling || enabled === null) return;
    setConfirmPending(!enabled);
    setToggleError(null);
  };

  // OBL-006 — Effectuer le toggle après confirmation
  const handleToggleConfirm = async () => {
    if (confirmPending === null) return;
    const newValue = confirmPending;
    setConfirmPending(null);
    setToggling(true);
    setToggleError(null);
    try {
      await updateSystemConfig(FLAG_KEY, String(newValue));
      setEnabled(newValue);
      void load(); // recharger les statuts postes après changement
    } catch {
      setToggleError('Erreur lors de la mise à jour du flag. Vérifiez votre connexion.');
    } finally {
      setToggling(false);
    }
  };

  const statusIcon = (done: number, req: number) =>
    done >= req
      ? <CheckCircle className="w-4 h-4 text-green-500" />
      : <XCircle className="w-4 h-4 text-red-400" />;

  return (
    <div className="space-y-4">
      {/* OBL-007 — Modal de confirmation */}
      {confirmPending !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
              <h3 className="font-semibold text-gray-900">
                {confirmPending ? 'Activer les obligations ?' : 'Désactiver les obligations ?'}
              </h3>
            </div>
            <p className="text-sm text-gray-600">
              {confirmPending
                ? 'Cette action bloquera la rotation tant que les 15 appels requis et le contrôle qualité du bloc actif ne sont pas validés.'
                : 'Cette action permettra la rotation sans contrôle des obligations d\'appel.'}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmPending(null)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={() => void handleToggleConfirm()}
                className={`flex-1 py-2 rounded-lg text-white text-sm font-medium ${
                  confirmPending ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {confirmPending ? 'Activer' : 'Désactiver'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-orange-600" />
          <h3 className="text-base font-bold text-gray-900">Obligations d'appels GICOP</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* OBL-006 — Toggle avec loading/erreur */}
          <button
            onClick={handleToggleRequest}
            disabled={toggling || enabled === null}
            title={enabled ? 'Cliquez pour désactiver' : 'Cliquez pour activer'}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              enabled
                ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
            } disabled:opacity-50`}
          >
            {toggling
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : enabled
              ? <ToggleRight className="w-4 h-4" />
              : <ToggleLeft className="w-4 h-4" />
            }
            {toggling ? 'Mise à jour…' : enabled ? 'Activé' : 'Désactivé'}
          </button>

          <button onClick={() => void load()} disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {toggleError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {toggleError}
        </div>
      )}

      {!enabled && enabled !== null && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Les obligations d'appels sont désactivées — la rotation n'est pas bloquée.
        </div>
      )}

      <p className="text-xs text-gray-500">
        Chaque commercial doit effectuer 15 appels (5 commandes annulées + 5 livrées + 5 sans commande) ≥ 1min30 avant la prochaine rotation.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Poste</th>
              <th className="px-4 py-3 text-center">Batch</th>
              <th className="px-4 py-3 text-center">Annulées (5)</th>
              <th className="px-4 py-3 text-center">Livrées (5)</th>
              <th className="px-4 py-3 text-center">Sans cmd (5)</th>
              <th className="px-4 py-3 text-center">Qualité msg</th>
              <th className="px-4 py-3 text-center">Rotation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const o = row.obligation;
              if (!o) {
                return (
                  <tr key={row.posteId} className="bg-white">
                    <td className="px-4 py-3 font-medium text-gray-700">{row.posteName}</td>
                    <td colSpan={6} className="px-4 py-3 text-center text-gray-400 text-xs">
                      {enabled ? 'Aucun batch actif' : 'Désactivé'}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={row.posteId} className={o.readyForRotation ? 'bg-green-50' : 'bg-white hover:bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-gray-800">{row.posteName}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">#{o.batchNumber}</td>

                  {/* Catégories */}
                  {(['annulee', 'livree', 'sansCommande'] as const).map((key) => (
                    <td key={key} className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {statusIcon(o[key].done, o[key].required)}
                        <span className={`text-xs font-semibold ${o[key].done >= o[key].required ? 'text-green-700' : 'text-red-600'}`}>
                          {o[key].done}/{o[key].required}
                        </span>
                      </div>
                    </td>
                  ))}

                  {/* Qualité */}
                  <td className="px-4 py-3 text-center">
                    {o.qualityCheckPassed
                      ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                      : <AlertTriangle className="w-4 h-4 text-orange-400 mx-auto" />
                    }
                  </td>

                  {/* Rotation dispo */}
                  <td className="px-4 py-3 text-center">
                    {o.readyForRotation
                      ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Prête</span>
                      : <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">En attente</span>
                    }
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">Aucune donnée</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
