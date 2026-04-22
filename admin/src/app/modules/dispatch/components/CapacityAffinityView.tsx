"use client";

import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, Users, Star, AlertTriangle, CheckCircle } from "lucide-react";
import {
  getCapacitySummary,
  getAffinityStats,
  CapacitySummaryEntry,
  AffinityStatEntry,
} from "@/app/lib/api/dispatch.api";

export default function CapacityAffinityView() {
  const [capacity, setCapacity] = useState<CapacitySummaryEntry[]>([]);
  const [affinity, setAffinity] = useState<AffinityStatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const affinityByPoste = React.useMemo(() => {
    const map = new Map<string, AffinityStatEntry>();
    for (const a of affinity) map.set(a.posteId, a);
    return map;
  }, [affinity]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cap, aff] = await Promise.all([getCapacitySummary(), getAffinityStats()]);
      setCapacity(cap);
      setAffinity(aff);
      setLastUpdated(new Date().toLocaleTimeString("fr-FR"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Capacité & Affinités</h2>
          <p className="text-sm text-gray-500 mt-0.5">S2-006 — Surcharge et sticky assignment par poste</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
          {lastUpdated && <span className="text-xs text-gray-400 ml-1">{lastUpdated}</span>}
        </button>
      </div>

      {/* Table par poste */}
      {capacity.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Aucune donnée — fenêtre glissante non activée ou aucune conversation en cours.
        </div>
      )}

      {capacity.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Poste</th>
                <th className="px-4 py-3 text-center">Actives</th>
                <th className="px-4 py-3 text-center">Validées</th>
                <th className="px-4 py-3 text-center">Verrouillées</th>
                <th className="px-4 py-3 text-center">Quota actif</th>
                <th className="px-4 py-3 text-center">Saturation</th>
                <th className="px-4 py-3 text-center">Affinités actives</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {capacity.map((row) => {
                const affinityStat = affinityByPoste.get(row.posteId);
                const saturationPct = row.quotaActive > 0
                  ? Math.round((row.activeCount / row.quotaActive) * 100)
                  : 0;
                const isFull = row.activeCount >= row.quotaActive;

                return (
                  <tr key={row.posteId} className={isFull ? "bg-red-50" : "bg-white hover:bg-gray-50"}>
                    <td className="px-4 py-3 font-medium text-gray-800 flex items-center gap-2">
                      {isFull ? (
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                      )}
                      {row.posteName}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-700">
                      {row.activeCount}
                    </td>
                    <td className="px-4 py-3 text-center text-green-700">{row.validatedCount}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{row.lockedCount}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{row.quotaActive}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-20 bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              isFull ? "bg-red-500" : saturationPct >= 70 ? "bg-orange-400" : "bg-blue-500"
                            }`}
                            style={{ width: `${Math.min(saturationPct, 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium w-10 text-right ${isFull ? "text-red-600" : "text-gray-600"}`}>
                          {saturationPct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {affinityStat ? (
                        <span className="flex items-center gap-1 justify-center text-amber-700 font-semibold">
                          <Star className="w-3.5 h-3.5" />
                          {affinityStat.count}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bloc affinités avec contacts fidèles par poste */}
      {affinity.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" />
            Détail affinités actives par poste
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {affinity.map((a) => {
              const cap = capacity.find((c) => c.posteId === a.posteId);
              return (
                <div key={a.posteId} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800 text-sm">
                      {cap?.posteName ?? a.posteId.slice(0, 8) + "…"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold">
                      <Users className="w-3 h-3" /> {a.count} contact{a.count > 1 ? "s" : ""}
                    </span>
                  </div>
                  {a.topChatIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.topChatIds.map((id) => (
                        <span key={id} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono truncate max-w-[120px]" title={id}>
                          {id.split("@")[0]}
                        </span>
                      ))}
                      {a.count > a.topChatIds.length && (
                        <span className="text-xs text-gray-400 px-1.5 py-0.5">
                          +{a.count - a.topChatIds.length} autres
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
