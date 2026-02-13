"use client";

import React, { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { QueuePosition } from "@/app/lib/definitions";
import { logger } from "@/app/lib/logger";

type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

const normalizeQueue = (data: unknown): QueuePosition[] => {
  if (!Array.isArray(data)) return [];
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

const QueueView = () => {
  const [queue, setQueue] = useState<QueuePosition[]>([]);
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    let socket: Socket | null = null;

    try {
      socket = io(WS_URL, {
        transports: ["websocket"],
        withCredentials: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setError(message);
      logger.error("QueueView socket init failed", { message });
      return undefined;
    }

    setStatus("connecting");

    const handleQueueUpdate = (payload: unknown) => {
      setQueue(normalizeQueue(payload));
      setLastUpdated(new Date().toISOString());
    };

    socket.on("connect", () => {
      setStatus("connected");
      setError(null);
    });

    socket.on("disconnect", () => {
      setStatus("disconnected");
    });

    socket.on("reconnect_attempt", () => {
      setStatus("reconnecting");
    });

    socket.on("reconnect", () => {
      setStatus("connected");
    });

    socket.on("connect_error", (err: Error) => {
      setStatus("error");
      setError(err?.message ?? "Erreur de connexion socket");
      logger.error("QueueView socket connect error", {
        message: err?.message ?? "unknown",
      });
    });

    socket.on("queue:updated", handleQueueUpdate);

    return () => {
      socket?.off("queue:updated", handleQueueUpdate);
      socket?.disconnect();
    };
  }, []);

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
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClass}`}
          >
            {statusLabel}
          </span>
          <span className="text-xs text-gray-500">
            Derniere maj: {lastUpdated ? formatDate(lastUpdated) : "-"}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {queue.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default QueueView;
