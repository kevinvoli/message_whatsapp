"use client";

import React, { useEffect, useState, useCallback } from 'react';
import {
  Phone, CheckCircle, AlertTriangle, RefreshCw, XCircle,
  ToggleLeft, ToggleRight, Loader2, ChevronDown, ChevronRight,
  Database, Clock,
} from 'lucide-react';
import { getSystemConfigs, updateSystemConfig } from '@/app/lib/api/system-config.api';
import { formatDate } from '@/app/lib/dateUtils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const FLAG_KEY = 'FF_CALL_OBLIGATIONS_ENABLED';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface CallTask {
  id: string;
  category: 'COMMANDE_ANNULEE' | 'COMMANDE_AVEC_LIVRAISON' | 'JAMAIS_COMMANDE';
  status: 'PENDING' | 'DONE';
  clientPhone: string | null;
  callEventId: string | null;
  durationSeconds: number | null;
  completedAt: string | null;
  createdAt: string;
}

interface PosteTaskDetail {
  batchId: string | null;
  batchNumber: number | null;
  tasks: CallTask[];
}

interface PosteRow {
  posteId: string;
  posteName: string;
  obligation: ObligationStatus | null;
}

interface SyncStatus {
  db2: { dbAvailable: boolean; lastSyncAt: string | null; processedCount: number };
  syncLog: Record<string, number>;
}

const CATEGORY_LABELS: Record<CallTask['category'], string> = {
  COMMANDE_ANNULEE:        'Annulée',
  COMMANDE_AVEC_LIVRAISON: 'Livrée',
  JAMAIS_COMMANDE:         'Sans cmd',
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchObligation(posteId: string): Promise<ObligationStatus | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/call-obligations/poste/${posteId}`, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json() as ObligationStatus;
  } catch { return null; }
}

async function fetchTasks(posteId: string): Promise<PosteTaskDetail | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/call-obligations/poste/${posteId}/tasks`, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json() as PosteTaskDetail;
  } catch { return null; }
}

async function runQualityCheck(posteId: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/call-obligations/quality-check/${posteId}`, {
      method: 'POST', credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json() as { qualityCheckPassed: boolean };
    return data.qualityCheckPassed;
  } catch { return null; }
}

async function fetchSyncStatus(): Promise<SyncStatus | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/order-sync/status`, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json() as SyncStatus;
  } catch { return null; }
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function CallObligationsView({ postes }: { postes: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<PosteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [confirmPending, setConfirmPending] = useState<boolean | null>(null);
  const [expandedPoste, setExpandedPoste] = useState<string | null>(null);
  const [taskDetails, setTaskDetails] = useState<Record<string, PosteTaskDetail>>({});
  const [loadingTasks, setLoadingTasks] = useState<string | null>(null);
  const [qualityRunning, setQualityRunning] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const loadFlag = useCallback(async () => {
    try {
      const configs = await getSystemConfigs();
      const entry = configs.find((c) => c.configKey === FLAG_KEY);
      setEnabled(entry?.configValue === 'true');
    } catch { /* silencieux */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [results, sync] = await Promise.all([
      Promise.all(postes.map(async (p) => ({
        posteId: p.id,
        posteName: p.name,
        obligation: await fetchObligation(p.id),
      }))),
      fetchSyncStatus(),
    ]);
    setRows(results);
    setSyncStatus(sync);
    setLoading(false);
  }, [postes]);

  useEffect(() => {
    void loadFlag();
    void load();
  }, [load, loadFlag]);

  const handleToggleRequest = () => {
    if (toggling || enabled === null) return;
    setConfirmPending(!enabled);
    setToggleError(null);
  };

  const handleToggleConfirm = async () => {
    if (confirmPending === null) return;
    const newValue = confirmPending;
    setConfirmPending(null);
    setToggling(true);
    setToggleError(null);
    try {
      await updateSystemConfig(FLAG_KEY, String(newValue));
      setEnabled(newValue);
      void load();
    } catch {
      setToggleError('Erreur lors de la mise à jour du flag. Vérifiez votre connexion.');
    } finally {
      setToggling(false);
    }
  };

  // OBL-013 — Expansion détail tâches
  const handleExpandPoste = async (posteId: string) => {
    if (expandedPoste === posteId) { setExpandedPoste(null); return; }
    setExpandedPoste(posteId);
    if (taskDetails[posteId]) return;
    setLoadingTasks(posteId);
    const detail = await fetchTasks(posteId);
    if (detail) setTaskDetails((prev) => ({ ...prev, [posteId]: detail }));
    setLoadingTasks(null);
  };

  // OBL-014 — Contrôle qualité manuel par poste
  const handleQualityCheck = async (posteId: string) => {
    setQualityRunning(posteId);
    await runQualityCheck(posteId);
    // Recharger ce poste uniquement
    const updated = await fetchObligation(posteId);
    setRows((prev) => prev.map((r) => r.posteId === posteId ? { ...r, obligation: updated } : r));
    setQualityRunning(null);
  };

  const statusIcon = (done: number, req: number) =>
    done >= req
      ? <CheckCircle className="w-4 h-4 text-green-500" />
      : <XCircle className="w-4 h-4 text-red-400" />;

  return (
    <div className="space-y-4">
      {/* Confirmation modal OBL-007 */}
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
                : "Cette action permettra la rotation sans contrôle des obligations d'appel."}
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmPending(null)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={() => void handleToggleConfirm()}
                className={`flex-1 py-2 rounded-lg text-white text-sm font-medium ${confirmPending ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'}`}>
                {confirmPending ? 'Activer' : 'Désactiver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-orange-600" />
          <h3 className="text-base font-bold text-gray-900">Obligations d'appels GICOP</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleToggleRequest} disabled={toggling || enabled === null}
            title={enabled ? 'Cliquez pour désactiver' : 'Cliquez pour activer'}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${enabled ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100' : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'} disabled:opacity-50`}>
            {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
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
          <XCircle className="w-4 h-4 flex-shrink-0" />{toggleError}
        </div>
      )}

      {!enabled && enabled !== null && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Les obligations d'appels sont désactivées — la rotation n'est pas bloquée.
        </div>
      )}

      {/* OBL-015 — Statut sync DB2 */}
      {syncStatus && (
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${syncStatus.db2.dbAvailable ? 'bg-gray-50 border-gray-200 text-gray-600' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <Database className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">DB2 {syncStatus.db2.dbAvailable ? 'disponible' : 'indisponible'}</span>
          {syncStatus.db2.lastSyncAt && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              Dernier sync : {formatDate(syncStatus.db2.lastSyncAt)}
            </span>
          )}
          <span className="text-xs text-gray-400 ml-auto">{syncStatus.db2.processedCount.toLocaleString()} appels traités</span>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Chaque commercial doit effectuer 15 appels (5 annulées + 5 livrées + 5 sans commande) ≥ 1min30 avant la prochaine rotation.
      </p>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left w-4"></th>
              <th className="px-4 py-3 text-left">Poste</th>
              <th className="px-4 py-3 text-center">Batch</th>
              <th className="px-4 py-3 text-center">Annulées (5)</th>
              <th className="px-4 py-3 text-center">Livrées (5)</th>
              <th className="px-4 py-3 text-center">Sans cmd (5)</th>
              <th className="px-4 py-3 text-center">Qualité bloc</th>
              <th className="px-4 py-3 text-center">Rotation</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const o = row.obligation;
              const isExpanded = expandedPoste === row.posteId;
              const detail = taskDetails[row.posteId];

              return (
                <React.Fragment key={row.posteId}>
                  <tr className={o?.readyForRotation ? 'bg-green-50' : 'bg-white hover:bg-gray-50'}>
                    {/* OBL-013 — Bouton expansion */}
                    <td className="px-2 py-3">
                      {o && (
                        <button onClick={() => void handleExpandPoste(row.posteId)}
                          className="p-0.5 text-gray-400 hover:text-gray-600 rounded">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{row.posteName}</td>

                    {!o ? (
                      <td colSpan={7} className="px-4 py-3 text-center text-gray-400 text-xs">
                        {enabled ? 'Aucun batch actif' : 'Désactivé'}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">#{o.batchNumber}</td>
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
                        <td className="px-4 py-3 text-center">
                          {o.qualityCheckPassed
                            ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                            : <AlertTriangle className="w-4 h-4 text-orange-400 mx-auto" />}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {o.readyForRotation
                            ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Prête</span>
                            : <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">En attente</span>}
                        </td>
                        {/* OBL-014 — Bouton qualité manuelle */}
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => void handleQualityCheck(row.posteId)}
                            disabled={qualityRunning === row.posteId}
                            title="Lancer le contrôle qualité du bloc actif"
                            className="flex items-center gap-1 mx-auto px-2 py-1 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 disabled:opacity-50"
                          >
                            {qualityRunning === row.posteId
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <CheckCircle className="w-3 h-3" />}
                            Qualité
                          </button>
                        </td>
                      </>
                    )}
                  </tr>

                  {/* OBL-013 — Ligne détail tâches */}
                  {isExpanded && (
                    <tr className="bg-gray-50">
                      <td colSpan={9} className="px-6 py-3">
                        {loadingTasks === row.posteId ? (
                          <div className="flex items-center gap-2 text-gray-400 text-xs">
                            <Loader2 className="w-3 h-3 animate-spin" /> Chargement des tâches…
                          </div>
                        ) : !detail || detail.tasks.length === 0 ? (
                          <p className="text-xs text-gray-400">Aucune tâche</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-3">
                            {(['COMMANDE_ANNULEE', 'COMMANDE_AVEC_LIVRAISON', 'JAMAIS_COMMANDE'] as const).map((cat) => {
                              const catTasks = detail.tasks.filter((t) => t.category === cat);
                              return (
                                <div key={cat} className="space-y-1">
                                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                                    {CATEGORY_LABELS[cat]}
                                  </p>
                                  {catTasks.map((t) => (
                                    <div key={t.id} className={`flex items-center justify-between text-xs px-2 py-1 rounded ${t.status === 'DONE' ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-500'}`}>
                                      <span>{t.status === 'DONE' ? '✓' : '○'} {t.clientPhone ?? '—'}</span>
                                      {t.durationSeconds && (
                                        <span className="text-gray-400">{Math.round(t.durationSeconds / 60)}min</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">Aucune donnée</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
