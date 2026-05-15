"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Link2,
  PlusCircle,
  BarChart3,
  Copy,
  Edit,
  Trash2,
  ArrowLeft,
  ExternalLink,
  Smartphone,
  Monitor,
  Tablet,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  getCampaignLinks,
  getCampaignLink,
  createCampaignLink,
  updateCampaignLink,
  deleteCampaignLink,
  getCampaignLinkStats,
  getCampaignLinkClicks,
  getChannels,
} from '@/app/lib/api';
import { CampaignLink, CampaignLinkClick, CampaignLinkStats, Channel } from '@/app/lib/definitions';
import { Spinner } from '@/app/ui/Spinner';
import { useToast } from '@/app/ui/ToastProvider';
import { formatDate, formatDateShort, formatDateTimeWithSeconds } from '@/app/lib/dateUtils';

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function conversionRate(link: CampaignLink): string {
  if (!link.clickCount) return '0.0%';
  return `${((link.conversionCount / link.clickCount) * 100).toFixed(1)}%`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function deviceIcon(deviceType: string | null) {
  switch (deviceType) {
    case 'mobile':
      return <Smartphone className="w-3.5 h-3.5 text-blue-500" />;
    case 'desktop':
      return <Monitor className="w-3.5 h-3.5 text-gray-500" />;
    case 'tablet':
      return <Tablet className="w-3.5 h-3.5 text-violet-500" />;
    default:
      return <HelpCircle className="w-3.5 h-3.5 text-orange-400" />;
  }
}

function deviceColor(deviceType: string): string {
  switch (deviceType) {
    case 'mobile':
      return 'bg-blue-500';
    case 'desktop':
      return 'bg-gray-400';
    case 'tablet':
      return 'bg-violet-500';
    default:
      return 'bg-orange-400';
  }
}

function deviceLabel(deviceType: string | null): string {
  switch (deviceType) {
    case 'mobile':
      return 'Mobile';
    case 'desktop':
      return 'Ordinateur';
    case 'tablet':
      return 'Tablette';
    default:
      return 'Autre';
  }
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Composant KPI card ───────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

// ─── Formulaire création / édition ────────────────────────────────────────────

interface LinkFormProps {
  channels: Channel[];
  initial?: CampaignLink | null;
  loading: boolean;
  onSave: (data: {
    name: string;
    channel_id: string;
    predefined_message: string;
    is_active: boolean;
  }) => Promise<CampaignLink | null>;
  onCancel: () => void;
}

function CampaignLinkForm({ channels, initial, loading, onSave, onCancel }: LinkFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [channelId, setChannelId] = useState(initial?.channelId ?? (channels[0]?.id ?? ''));
  const [message, setMessage] = useState(initial?.predefinedMessage ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [savedLink, setSavedLink] = useState<CampaignLink | null>(null);
  const [copying, setCopying] = useState<'direct' | 'tracked' | null>(null);
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !channelId) return;
    const result = await onSave({
      name: name.trim(),
      channel_id: channelId,
      predefined_message: message.trim(),
      is_active: isActive,
    });
    if (result) setSavedLink(result);
  };

  const copy = async (text: string, type: 'direct' | 'tracked') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopying(type);
      addToast({ type: 'success', message: 'URL copiée dans le presse-papier.' });
      setTimeout(() => setCopying(null), 1500);
    } catch {
      addToast({ type: 'error', message: 'Impossible de copier l\'URL.' });
    }
  };

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="cl-name">
          Nom <span className="text-red-500">*</span>
        </label>
        <input
          id="cl-name"
          type="text"
          className={inputClass}
          placeholder="Ex: Campagne été 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="cl-channel">
          Canal <span className="text-red-500">*</span>
        </label>
        <select
          id="cl-channel"
          className={inputClass}
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          required
        >
          <option value="">-- Sélectionner un canal --</option>
          {channels.map((ch) => {
            const label = ch.label || ch.channel_id;
            const phone = ch.phone_number ? ` · ${ch.phone_number}` : '';
            return (
              <option key={ch.id} value={ch.id}>
                {label}{phone}
              </option>
            );
          })}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="cl-message">
          Message pré-défini
        </label>
        <textarea
          id="cl-message"
          className={inputClass}
          rows={3}
          placeholder="Message envoyé automatiquement quand le client clique sur le lien..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          onClick={() => setIsActive((v) => !v)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            isActive ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              isActive ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-gray-700">Lien actif</span>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          disabled={loading}
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading || !name.trim() || !channelId}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Enregistrement...' : initial ? 'Mettre à jour' : 'Créer'}
        </button>
      </div>

      {savedLink && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-green-800">URLs générées</p>

          {/* URL de suivi — c'est CETTE URL qu'on met dans les pubs */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-700 mb-0.5">URL de suivi ← mettre dans les pubs</p>
              <p className="truncate text-xs font-mono text-gray-700">{savedLink.trackedUrl}</p>
              {!savedLink.trackedUrl.startsWith('http') && (
                <p className="text-xs text-red-500 mt-0.5">⚠ URL relative — configurer APP_URL sur le serveur</p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => void copy(savedLink.trackedUrl, 'tracked')}
                className="rounded p-1.5 text-gray-500 hover:bg-green-100"
                title="Copier l'URL de suivi"
                aria-label="Copier l'URL de suivi"
              >
                <Copy className={`w-3.5 h-3.5 ${copying === 'tracked' ? 'text-green-600' : ''}`} />
              </button>
              {savedLink.trackedUrl.startsWith('http') && (
                <button
                  type="button"
                  onClick={() => window.open(savedLink.trackedUrl, '_blank')}
                  className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                  title="Tester le suivi (ouvre WhatsApp ET enregistre un clic)"
                  aria-label="Tester l'URL de suivi"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* URL directe — pour tester WhatsApp sans tracking */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">URL directe (sans suivi)</p>
              <p className="truncate text-xs font-mono text-gray-500">{savedLink.directUrl}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => void copy(savedLink.directUrl, 'direct')}
                className="rounded p-1.5 text-gray-400 hover:bg-green-100"
                title="Copier l'URL directe"
                aria-label="Copier l'URL directe"
              >
                <Copy className={`w-3.5 h-3.5 ${copying === 'direct' ? 'text-green-600' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// ─── Liste des liens ──────────────────────────────────────────────────────────

interface CampaignLinksListProps {
  onSelectLink: (id: string) => void;
}

function CampaignLinksList({ onSelectLink }: CampaignLinksListProps) {
  const { addToast } = useToast();
  const [links, setLinks] = useState<CampaignLink[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editLink, setEditLink] = useState<CampaignLink | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksData, channelsData] = await Promise.all([getCampaignLinks(), getChannels()]);
      setLinks(linksData);
      setChannels(channelsData);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur de chargement.' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async (data: {
    name: string;
    channel_id: string;
    predefined_message: string;
    is_active: boolean;
  }): Promise<CampaignLink | null> => {
    setSaving(true);
    try {
      let result: CampaignLink;
      if (editLink) {
        result = await updateCampaignLink(editLink.id, data);
        setLinks((prev) => prev.map((l) => (l.id === result.id ? result : l)));
        addToast({ type: 'success', message: 'Lien mis à jour.' });
      } else {
        result = await createCampaignLink(data);
        setLinks((prev) => [result, ...prev]);
        addToast({ type: 'success', message: 'Lien créé.' });
      }
      return result;
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.' });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce lien de campagne ?')) return;
    try {
      await deleteCampaignLink(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      addToast({ type: 'success', message: 'Lien supprimé.' });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur lors de la suppression.' });
    }
  };

  const handleCopyTracked = async (trackedUrl: string) => {
    try {
      await navigator.clipboard.writeText(trackedUrl);
      addToast({ type: 'success', message: 'URL de suivi copiée.' });
    } catch {
      addToast({ type: 'error', message: 'Impossible de copier l\'URL.' });
    }
  };

  const openCreate = () => {
    setEditLink(null);
    setShowForm(true);
  };

  const openEdit = (link: CampaignLink) => {
    setEditLink(link);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditLink(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
          <Link2 className="w-5 h-5" />
          Liens de campagne
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            title="Rafraîchir les compteurs"
          >
            <ArrowLeft className="w-4 h-4 rotate-[135deg]" />
            Rafraîchir
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <PlusCircle className="w-4 h-4" />
            Nouveau lien
          </button>
        </div>
      </div>

      {/* Formulaire (modal inline) */}
      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-blue-900">
            {editLink ? 'Modifier le lien' : 'Nouveau lien de campagne'}
          </h3>
          <CampaignLinkForm
            channels={channels}
            initial={editLink}
            loading={saving}
            onSave={handleSave}
            onCancel={cancelForm}
          />
        </div>
      )}

      {/* Tableau */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-12 text-center text-gray-500">
          <Link2 className="mx-auto mb-3 w-8 h-8 text-gray-300" />
          <p className="text-sm">Aucun lien de campagne. Créez votre premier lien.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Canal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Clics</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversions</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {links.map((link) => (
                <tr key={link.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{link.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {link.channel?.label || link.channelId}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">
                    {link.predefinedMessage ? truncate(link.predefinedMessage, 50) : <span className="italic text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-800">
                    {link.clickCount}
                    {!link.trackedUrl.startsWith('http') && (
                      <span className="ml-1 text-red-400" title="APP_URL non configuré — URL de suivi invalide">⚠</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-gray-800">{link.conversionCount}</span>
                    {link.clickCount > 0 && (
                      <span className="ml-1.5 text-xs text-gray-400">({conversionRate(link)})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {link.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Actif
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        Inactif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onSelectLink(link.id)}
                        className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50"
                        title="Voir les analytics"
                        aria-label="Voir les analytics"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void handleCopyTracked(link.trackedUrl)}
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                        title="Copier l'URL de suivi"
                        aria-label="Copier l'URL de suivi"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {link.trackedUrl.startsWith('http') && (
                        <button
                          onClick={() => window.open(link.trackedUrl, '_blank')}
                          className="rounded p-1.5 text-blue-500 hover:bg-blue-50"
                          title="Tester le suivi (clic enregistré)"
                          aria-label="Tester l'URL de suivi"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(link)}
                        className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                        title="Modifier"
                        aria-label="Modifier le lien"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void handleDelete(link.id)}
                        className="rounded p-1.5 text-red-600 hover:bg-red-50"
                        title="Supprimer"
                        aria-label="Supprimer le lien"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Analytics d'un lien ──────────────────────────────────────────────────────

interface CampaignLinkAnalyticsProps {
  linkId: string;
  onBack: () => void;
}

function CampaignLinkAnalytics({ linkId, onBack }: CampaignLinkAnalyticsProps) {
  const { addToast } = useToast();
  const [link, setLink] = useState<CampaignLink | null>(null);
  const [stats, setStats] = useState<CampaignLinkStats | null>(null);
  const [clicks, setClicks] = useState<CampaignLinkClick[]>([]);
  const [loadingLink, setLoadingLink] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingClicks, setLoadingClicks] = useState(true);
  const [clickPage, setClickPage] = useState(1);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const loadLink = useCallback(async () => {
    try {
      const data = await getCampaignLink(linkId);
      setLink(data);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur de chargement.' });
    } finally {
      setLoadingLink(false);
    }
  }, [linkId, addToast]);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const data = await getCampaignLinkStats(linkId, from, to);
      setStats(data);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur stats.' });
    } finally {
      setLoadingStats(false);
    }
  }, [linkId, from, to, addToast]);

  const loadClicks = useCallback(async () => {
    setLoadingClicks(true);
    try {
      const data = await getCampaignLinkClicks(linkId, clickPage);
      setClicks(data);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur clics.' });
    } finally {
      setLoadingClicks(false);
    }
  }, [linkId, clickPage, addToast]);

  useEffect(() => { void loadLink(); }, [loadLink]);
  useEffect(() => { void loadStats(); }, [loadStats]);
  useEffect(() => { void loadClicks(); }, [loadClicks]);

  const setPeriod = (days: number) => {
    setFrom(daysAgo(days));
    setTo(new Date().toISOString().slice(0, 10));
  };

  const maxDeviceCount = stats?.clicks_by_device.length
    ? Math.max(...stats.clicks_by_device.map((d) => d.count))
    : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
          aria-label="Retour à la liste"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>
        {loadingLink ? (
          <Spinner />
        ) : (
          <>
            <h2 className="text-xl font-semibold text-gray-900">{link?.name}</h2>
            {link?.isActive ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                Actif
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                Inactif
              </span>
            )}
          </>
        )}
      </div>

      {/* KPIs */}
      {loadingStats ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Clics totaux" value={stats.total_clicks} />
            <KpiCard label="Clics uniques" value={stats.unique_clicks} />
            <KpiCard label="Conversions" value={stats.total_conversions} />
            <KpiCard label="Taux de conversion" value={`${stats.conversion_rate.toFixed(1)}%`} />
          </div>

          {/* Filtres de période */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setPeriod(d)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    from === daysAgo(d) && to === new Date().toISOString().slice(0, 10)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {d} jours
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
                aria-label="Date de début"
              />
              <span>→</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
                aria-label="Date de fin"
              />
            </div>
          </div>

          {/* Graphique temporel */}
          {stats.clicks_by_day.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Evolution clics / conversions</h3>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={stats.clicks_by_day} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => formatDateShort(v)}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, name: any) => [value, name === 'clicks' ? 'Clics' : 'Conversions'] as any}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    labelFormatter={(label: any) => formatDateShort(String(label)) as any}
                  />
                  <Legend
                    formatter={(value: string) => (value === 'clicks' ? 'Clics' : 'Conversions')}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="clicks" fill="#3b82f6" name="clicks" radius={[3, 3, 0, 0]} />
                  <Line dataKey="conversions" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="conversions" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Répartition par appareil */}
          {stats.clicks_by_device.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Répartition par appareil</h3>
              <div className="space-y-2">
                {stats.clicks_by_device.map((item) => (
                  <div key={item.device_type} className="flex items-center gap-3">
                    {deviceIcon(item.device_type)}
                    <span className="w-24 text-xs text-gray-600">{deviceLabel(item.device_type)}</span>
                    <div className="flex-1 rounded-full bg-gray-100 h-2">
                      <div
                        className={`h-2 rounded-full ${deviceColor(item.device_type)}`}
                        style={{ width: `${(item.count / maxDeviceCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs font-mono text-gray-700">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Tableau des clics récents */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-700">Clics récents</h3>
        </div>
        {loadingClicks ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : clicks.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun clic enregistré.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date &amp; heure</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Appareil</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Converti le</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clicks.map((click) => (
                <tr key={click.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 text-xs">{formatDateTimeWithSeconds(click.clickedAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      {deviceIcon(click.deviceType)}
                      <span className="text-xs text-gray-600">{deviceLabel(click.deviceType)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {click.converted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Converti
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                        En attente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {click.convertedAt ? formatDate(click.convertedAt) : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {click.chatId ? (
                      <span className="text-blue-600 font-medium">Voir</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loadingClicks && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <button
              onClick={() => setClickPage((p) => Math.max(1, p - 1))}
              disabled={clickPage === 1}
              className="flex items-center gap-1 rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              aria-label="Page précédente"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Précédent
            </button>
            <span className="text-xs text-gray-500">Page {clickPage}</span>
            <button
              onClick={() => setClickPage((p) => p + 1)}
              disabled={clicks.length === 0}
              className="flex items-center gap-1 rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              aria-label="Page suivante"
            >
              Suivant
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Composant racine ─────────────────────────────────────────────────────────

export default function CampaignLinksView() {
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);

  if (selectedLinkId) {
    return (
      <CampaignLinkAnalytics
        linkId={selectedLinkId}
        onBack={() => setSelectedLinkId(null)}
      />
    );
  }

  return <CampaignLinksList onSelectLink={(id) => setSelectedLinkId(id)} />;
}
