"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PlusCircle, RefreshCw, CheckCircle, Clock, XCircle, RotateCcw, AlertCircle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { Channel, WhatsappTemplate, WhatsappTemplateStatus } from '../lib/definitions';
import { getChannels, getWhatsappTemplates } from '../lib/api';
import { formatDateShort } from '../lib/dateUtils';
import TemplateFormModal from './TemplateFormModal';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

// ============================================================
// Badge de statut
// ============================================================

interface StatusBadgeProps {
  status: WhatsappTemplateStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<WhatsappTemplateStatus, { label: string; icon: React.ReactNode; className: string }> = {
    APPROVED: {
      label: 'Approuve',
      icon: <CheckCircle className="w-3.5 h-3.5" />,
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    },
    PENDING: {
      label: 'En attente',
      icon: <Clock className="w-3.5 h-3.5" />,
      className: 'bg-amber-100 text-amber-700 border-amber-200',
    },
    REJECTED: {
      label: 'Rejete',
      icon: <XCircle className="w-3.5 h-3.5" />,
      className: 'bg-red-100 text-red-700 border-red-200',
    },
  };

  const { label, icon, className } = config[status] ?? config['PENDING'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {icon}
      {label}
    </span>
  );
}

// ============================================================
// Badge de provider de canal
// ============================================================

function ProviderBadge({ provider }: { provider?: string | null }) {
  const map: Record<string, string> = {
    whapi:     'bg-emerald-100 text-emerald-700',
    meta:      'bg-blue-100 text-blue-700',
    messenger: 'bg-indigo-100 text-indigo-700',
    instagram: 'bg-pink-100 text-pink-700',
    telegram:  'bg-sky-100 text-sky-700',
  };
  const label = provider ?? 'inconnu';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${map[label] ?? 'bg-gray-100 text-gray-700'}`}>
      {label}
    </span>
  );
}

// ============================================================
// Composant principal
// ============================================================

export default function TemplatesView() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Charger les canaux au montage
  useEffect(() => {
    getChannels()
      .then((data) => {
        setChannels(data);
        if (data.length > 0) {
          setSelectedChannelId(data[0].id);
        }
      })
      .catch((err) => {
        setError('Impossible de charger les canaux.');
      });
  }, []);

  // Charger les templates quand le canal ou le filtre change
  const loadTemplates = useCallback(async () => {
    if (!selectedChannelId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getWhatsappTemplates(
        selectedChannelId,
        statusFilter || undefined,
      );
      setTemplates(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible de charger les templates.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedChannelId, statusFilter]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Connexion WebSocket pour les mises a jour en temps reel
  useEffect(() => {
    const socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setWsConnected(true);
    });

    socket.on('disconnect', () => {
      setWsConnected(false);
    });

    socket.on('admin:template_status_update', (payload: {
      templateId: string;
      externalId: string;
      name: string;
      status: WhatsappTemplateStatus;
      rejectionReason: string | null;
    }) => {
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.id === payload.templateId || t.externalId === payload.externalId) {
            return {
              ...t,
              status: payload.status,
              // Le rejectionReason n'est pas dans le type frontend — on le stocke
              // dans une propriete supplementaire recuperee au rechargement
            };
          }
          return t;
        }),
      );
      // Recharger pour avoir le rejectionReason mis a jour depuis la DB
      if (payload.status === 'REJECTED') {
        loadTemplates();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [loadTemplates]);

  const handleCreateSuccess = () => {
    loadTemplates();
  };

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);
  const metaChannels = channels.filter((c) => c.provider === 'meta' || c.provider === 'whapi');

  return (
    <div className="space-y-6">
      {/* Titre + actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates HSM</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestion des templates WhatsApp (soumission Meta, validation, envoi HSM)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Indicateur WebSocket */}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            wsConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-gray-50 text-gray-500 border-gray-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            {wsConnected ? 'Temps reel' : 'Non connecte'}
          </span>

          <button
            onClick={loadTemplates}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            disabled={channels.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircle className="w-4 h-4" />
            Nouveau template
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-xl border border-gray-200">
        {/* Selecteur canal */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Canal</label>
          <select
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.label ?? ch.channel_id} ({ch.provider ?? '?'})
              </option>
            ))}
          </select>
          {selectedChannel && (
            <ProviderBadge provider={selectedChannel.provider} />
          )}
        </div>

        {/* Filtre statut */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Statut</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tous</option>
            <option value="APPROVED">Approuves</option>
            <option value="PENDING">En attente</option>
            <option value="REJECTED">Rejetes</option>
          </select>
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Tableau des templates */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Chargement...
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">
              {selectedChannelId
                ? 'Aucun template pour ce canal.'
                : 'Selectionnez un canal pour voir ses templates.'}
            </p>
            {selectedChannelId && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
              >
                <PlusCircle className="w-4 h-4" />
                Creer le premier template
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Nom</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Categorie</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Langue</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">ID Meta</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Cree le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates.map((tpl) => (
                  <TemplateRow
                    key={tpl.id}
                    template={tpl}
                    channels={channels}
                    onResubmit={loadTemplates}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de creation */}
      {showCreateModal && (
        <TemplateFormModal
          channels={channels}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}

// ============================================================
// Ligne de template avec action "Re-soumettre"
// ============================================================

interface TemplateRowProps {
  template: WhatsappTemplate & { rejectionReason?: string | null };
  channels: Channel[];
  onResubmit: () => void;
}

function TemplateRow({ template, channels, onResubmit }: TemplateRowProps) {
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  const channel = channels.find((c) => c.id === template.channelId);

  const handleResubmit = async () => {
    setResubmitting(true);
    setResubmitError(null);
    try {
      // Appel du nouvel endpoint PATCH pour eviter la creation d'un doublon
      const { resubmitWhatsappTemplate } = await import('../lib/api');
      await resubmitWhatsappTemplate(template.id);
      onResubmit();
    } catch (err) {
      setResubmitError(
        err instanceof Error ? err.message : 'Echec de la re-soumission.',
      );
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-gray-900">{template.name}</span>
      </td>
      <td className="px-4 py-3 text-gray-600">
        {template.category ?? <span className="text-gray-400">-</span>}
      </td>
      <td className="px-4 py-3 text-gray-600">{template.language}</td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          <StatusBadge status={template.status} />
          {template.status === 'REJECTED' && (
            <div className="space-y-1">
              {(template as any).rejectionReason && (
                <p className="text-xs text-red-600 max-w-xs">
                  {(template as any).rejectionReason}
                </p>
              )}
              <button
                onClick={handleResubmit}
                disabled={resubmitting}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                {resubmitting ? 'Re-soumission...' : 'Re-soumettre'}
              </button>
              {resubmitError && (
                <p className="text-xs text-red-600">{resubmitError}</p>
              )}
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {template.externalId ? (
          <span className="font-mono text-xs text-gray-500">{template.externalId}</span>
        ) : (
          <span className="text-gray-400 text-xs">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
        {formatDateShort(template.createdAt)}
      </td>
    </tr>
  );
}
