"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { QueuePosition, Poste } from "@/app/lib/definitions";
import {
  blockPosteFromQueue,
  getPostes,
  getQueue,
  resetQueue,
  unblockPosteFromQueue,
} from "@/app/lib/api";
import { logger } from "@/app/lib/logger";
import { useToast } from "@/app/ui/ToastProvider";
import { useRealtimePolling } from "@/app/hooks/useRealtimePolling";
import { formatDate } from "@/app/lib/dateUtils";

type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

const normalizeQueue = (
  payload: unknown,
): { queue: QueuePosition[]; timestamp?: string; reason?: string } => {
  if (Array.isArray(payload)) {
    return { queue: sortQueue(payload) };
  }
  if (payload && typeof payload === "object") {
    const value = payload as {
      data?: QueuePosition[];
      timestamp?: string;
      reason?: string;
    };
    return {
      queue: sortQueue(value.data ?? []),
      timestamp: value.timestamp,
      reason: value.reason,
    };
  }
  return { queue: [] };
};

const sortQueue = (data: QueuePosition[]) => {
  return data
    .map((item) => {
      const position = Number((item as QueuePosition).position ?? 0);
      return {
        ...(item as QueuePosition),
        position,
      };
    })
    .sort((a, b) => a.position - b.position);
};

const QueueView = ({ onRefresh }: { onRefresh?: () => void }) => {
  const [queue, setQueue] = useState<QueuePosition[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [status, setStatus] = useState<ConnectionState>("disconnected");
  const [actionLoading, setActionLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [lastReason, setLastReason] = useState<string | null>(null);
  const { addToast } = useToast();

  const refreshQueueFromRest = async () => {
    const data = await getQueue();
    setQueue(sortQueue(data));
    setLastUpdated(new Date().toISOString());
  };

  const refreshPostes = async () => {
    const data = await getPostes();
    setPostes(data);
  };

  const handleRefresh = async () => {
    await Promise.all([refreshQueueFromRest(), refreshPostes()]);
    onRefresh?.();
  };

  useEffect(() => {
    void (async () => {
      try {
        setStatus("connecting");
        await Promise.all([refreshQueueFromRest(), refreshPostes()]);
        setStatus("connected");
      } catch (err) {
        logger.error("QueueView initial load failed", {
          message: err instanceof Error ? err.message : String(err),
        });
        setStatus("error");
      }
    })();
  }, []);

  const pollCallback = useCallback(async () => {
    try {
      await refreshQueueFromRest();
      setStatus("connected");
    } catch {
      setStatus("error");
    }
  }, []);

  useRealtimePolling(pollCallback, { interval: 5000 });


  const handleReset = async () => {
    const confirmed = window.confirm(
      "Confirmer le reset complet de la queue ? Tous les postes seront deconnectes.",
    );
    if (!confirmed) return;
    try {
      setActionLoading(true);
      await resetQueue();
      await Promise.all([refreshQueueFromRest(), refreshPostes()]);
      setLastReason("admin_reset");
      addToast({ type: "success", message: "Queue reinitialisee." });
    } catch (err) {
      addToast({
        type: "error",
        message:
          err instanceof Error ? err.message : "Erreur lors du reset de la queue",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlock = async (posteId: string) => {
    const confirmed = window.confirm(
      "Bloquer ce poste ? Il ne sera plus injecte dans la queue.",
    );
    if (!confirmed) return;
    try {
      setActionLoading(true);
      await blockPosteFromQueue(posteId);
      await Promise.all([refreshQueueFromRest(), refreshPostes()]);
      setLastReason("admin_block");
      addToast({ type: "success", message: "Poste bloque dans la queue." });
    } catch (err) {
      addToast({
        type: "error",
        message: err instanceof Error ? err.message : "Erreur lors du blocage",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblock = async (posteId: string) => {
    try {
      setActionLoading(true);
      await unblockPosteFromQueue(posteId);
      await Promise.all([refreshQueueFromRest(), refreshPostes()]);
      setLastReason("admin_unblock");
      addToast({ type: "success", message: "Poste debloque." });
    } catch (err) {
      addToast({
        type: "error",
        message: err instanceof Error ? err.message : "Erreur lors du deblocage",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const blockedPostes = postes.filter((poste) => poste.is_queue_enabled === false);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "connected":
        return "Connecte";
      case "reconnecting":
        return "Reconnexion";
      case "disconnected":
        return "Deconnecte";
      case "error":
        return "Erreur";
      default:
        return "Connexion";
    }
  }, [status]);

  const statusClass = useMemo(() => {
    switch (status) {
      case "connected":
        return "bg-green-100 text-green-700";
      case "reconnecting":
        return "bg-yellow-100 text-yellow-700";
      case "disconnected":
        return "bg-gray-100 text-gray-700";
      case "error":
        return "bg-red-100 text-red-700";
      default:
        return "bg-blue-100 text-blue-700";
    }
  }, [status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleRefresh}
          title="Rafraîchir"
          aria-label="Rafraîchir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Queue en temps reel
          </h2>
          <p className="text-sm text-gray-500">
            Positions des postes et statut d&apos;activite en direct.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={actionLoading}
            className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-400"
          >
            Reset queue
          </button>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClass}`}
          >
            {statusLabel}
          </span>
          <span className="text-xs text-gray-500">
            Derniere maj: {lastUpdated ? formatDate(lastUpdated) : "-"}
          </span>
          {lastReason && (
            <span className="text-xs text-gray-500">Source: {lastReason}</span>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Poste</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Ajoute le</th>
                <th className="px-4 py-3">Maj</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {queue.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-gray-500"
                  >
                    Aucune position dans la queue.
                  </td>
                </tr>
              ) : (
                queue.map((item) => {
                  const posteName = item.poste?.name ?? item.poste_id;
                  const posteCode = item.poste?.code;
                  const isActive = item.poste?.is_active ?? false;
                  const isQueueEnabled = item.poste?.is_queue_enabled ?? true;

                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        #{item.position}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {posteName}
                        </div>
                        {posteCode && (
                          <div className="text-xs text-gray-500">{posteCode}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                            isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {isActive ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(item.addedAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(item.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        {isQueueEnabled ? (
                          <button
                            type="button"
                            onClick={() => handleBlock(item.poste_id)}
                            disabled={actionLoading}
                            className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed"
                          >
                            Bloquer
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUnblock(item.poste_id)}
                            disabled={actionLoading}
                            className="rounded-md border border-green-200 px-2 py-1 text-xs font-semibold text-green-600 hover:bg-green-50 disabled:cursor-not-allowed"
                          >
                            Debloquer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Postes bloques
        </h3>
        {blockedPostes.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            Aucun poste bloque actuellement.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {blockedPostes.map((poste) => (
              <div
                key={poste.id}
                className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-gray-900">{poste.name}</div>
                  <div className="text-xs text-gray-500">{poste.code}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(poste.id)}
                  disabled={actionLoading}
                  className="rounded-md border border-green-200 px-2 py-1 text-xs font-semibold text-green-600 hover:bg-green-50 disabled:cursor-not-allowed"
                >
                  Debloquer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default QueueView;
