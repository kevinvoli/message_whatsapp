"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  BarChart3,
  MessageCircle,
  Link2,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Calendar,
  Search,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  StatutChannel,
  Channel,
  CampaignLink,
  ChannelDetailStats,
  ChannelLinkStats,
  ProviderType,
} from '@/app/lib/definitions';
import {
  getStatutChannelsFiltered,
  getChannels,
  getCampaignLinks,
  getChannelDetailStats,
} from '@/app/lib/api';
import { formatDateShort } from '@/app/lib/dateUtils';
import { Spinner } from './Spinner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChannelStatsViewProps {
  selectedPeriod: string;
  dateFrom?: string;
  dateTo?: string;
}

type TabId = 'resume' | 'detail';

// ─── Constantes ───────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  whapi:     { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Whapi' },
  meta:      { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Meta' },
  messenger: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Messenger' },
  instagram: { bg: 'bg-pink-100',   text: 'text-pink-700',   label: 'Instagram' },
  telegram:  { bg: 'bg-sky-100',    text: 'text-sky-700',    label: 'Telegram' },
};

const PROVIDERS_FILTER = ['tous', 'whapi', 'meta', 'messenger', 'instagram', 'telegram'];

// ─── Sous-composants ──────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider?: ProviderType | null }) {
  const colors = provider
    ? (PROVIDER_COLORS[provider] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: provider })
    : { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Inconnu' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
      {colors.label}
    </span>
  );
}

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  colorBg: string;
  rows: { label: string; value: string | number; color?: string }[];
}

function KpiCard({ label, value, icon, colorBg, rows }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2.5 rounded-lg ${colorBg} flex-shrink-0`}>{icon}</div>
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
      <div className="space-y-1.5 border-t border-gray-100 pt-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{r.label}</span>
            <span className={`font-semibold ${r.color ?? 'text-gray-800'}`}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ChannelStatsView({ selectedPeriod }: ChannelStatsViewProps) {
  // ── Onglets ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('resume');

  // ── Données globales ───────────────────────────────────────────────────────
  const [channels, setChannels] = useState<StatutChannel[]>([]);
  const [channelDetails, setChannelDetails] = useState<Channel[]>([]);
  const [campaignLinks, setCampaignLinks] = useState<CampaignLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filtre provider (onglet Résumé) ───────────────────────────────────────
  const [providerFilter, setProviderFilter] = useState<string>('tous');

  // ── Onglet Détail — sélection canal ───────────────────────────────────────
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');

  // ── Onglet Détail — filtre date local ─────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [detailDateFrom, setDetailDateFrom] = useState<string>('');
  const [detailDateTo, setDetailDateTo] = useState<string>(today);

  // ── Onglet Détail — stats ──────────────────────────────────────────────────
  const [detailStats, setDetailStats] = useState<ChannelDetailStats | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Chargement liste globale ───────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statChannels, allChannels, allLinks] = await Promise.all([
        getStatutChannelsFiltered(selectedPeriod),
        getChannels(),
        getCampaignLinks(),
      ]);
      setChannels(statChannels);
      setChannelDetails(allChannels);
      setCampaignLinks(allLinks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Chargement détail d'un canal ──────────────────────────────────────────

  const loadDetail = useCallback(async (channelId: string, dateFrom: string, dateTo: string) => {
    if (!channelId) return;
    setDetailLoading(true);
    setDetailError(null);
    setDetailStats(null);
    try {
      const stats = await getChannelDetailStats(
        channelId,
        'custom',
        dateFrom || undefined,
        dateTo || undefined,
      );
      setDetailStats(stats);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Erreur lors du chargement du détail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Recharge le détail quand canal ou dates changent (seulement si onglet actif)
  useEffect(() => {
    if (activeTab === 'detail' && selectedChannelId) {
      void loadDetail(selectedChannelId, detailDateFrom, detailDateTo);
    }
  }, [activeTab, selectedChannelId, detailDateFrom, detailDateTo, loadDetail]);

  // ── Action "Détail" depuis le tableau ─────────────────────────────────────

  const openDetail = (channelId: string) => {
    setSelectedChannelId(channelId);
    setActiveTab('detail');
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getChannelDetail = (channelId: string) =>
    channelDetails.find((c) => c.channel_id === channelId);

  const getChannelLinks = (channelId: string) =>
    campaignLinks.filter((l) => l.channelId === channelId || l.channel?.channel_id === channelId);

  const getChannelLabel = (stat: StatutChannel): string => {
    const detail = getChannelDetail(stat.channel_id);
    const raw = detail?.label ?? stat.label ?? stat.channel_id;
    return raw.length > 20 ? raw.slice(0, 18) + '…' : raw;
  };

  const getChannelLabelById = (channelId: string): string => {
    const detail = getChannelDetail(channelId);
    const raw = detail?.label ?? channelId;
    return raw.length > 40 ? raw.slice(0, 38) + '…' : raw;
  };

  // ── Filtre provider ───────────────────────────────────────────────────────

  const filteredChannels = channels.filter((stat) => {
    if (providerFilter === 'tous') return true;
    return (getChannelDetail(stat.channel_id)?.provider ?? null) === providerFilter;
  });

  // ── Données graphique ─────────────────────────────────────────────────────

  const chartData = (detailStats?.temporal ?? []).map((t) => ({
    date: formatDateShort(t.date),
    Entrants: t.messages_in,
    Sortants: t.messages_out,
    Total: t.total,
  }));

  const selectedChannelDetail = selectedChannelId ? getChannelDetail(selectedChannelId) : undefined;

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Statistiques par canal</h1>
        </div>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          aria-label="Rafraîchir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Barre d'onglets */}
      <div className="flex border-b border-gray-200">
        {([
          { id: 'resume' as TabId, label: 'Résumé global' },
          { id: 'detail' as TabId, label: 'Détail canal' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.id === 'detail' && selectedChannelId && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                {getChannelLabelById(selectedChannelId)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── ONGLET RÉSUMÉ ──────────────────────────────────────────────────── */}
      {activeTab === 'resume' && (
        <div className="space-y-4">
          {/* Filtres provider */}
          <div className="flex flex-wrap items-center gap-2">
            {PROVIDERS_FILTER.map((p) => {
              const colors = p !== 'tous' ? PROVIDER_COLORS[p] : null;
              const isActive = providerFilter === p;
              return (
                <button
                  key={p}
                  onClick={() => setProviderFilter(p)}
                  aria-pressed={isActive}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600'
                      : colors
                        ? `${colors.bg} ${colors.text} border-transparent hover:opacity-80`
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p === 'tous' ? 'Tous' : (PROVIDER_COLORS[p]?.label ?? p)}
                </button>
              );
            })}
            <span className="text-sm text-gray-400 ml-1">
              {filteredChannels.length} canal{filteredChannels.length !== 1 ? 'x' : ''}
            </span>
          </div>

          {/* Erreur */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Spinner */}
          {loading && (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          )}

          {/* Tableau */}
          {!loading && !error && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Canal', 'Provider', 'Conv. actives', 'Messages', 'Liens', 'Clics', ''].map((h, i) => (
                        <th
                          key={i}
                          className={`py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide ${i > 1 ? 'text-right' : 'text-left'} ${i === 6 ? 'w-20' : ''}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredChannels.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400 text-sm">
                          Aucun canal pour ce filtre
                        </td>
                      </tr>
                    )}
                    {filteredChannels.map((stat) => {
                      const detail = getChannelDetail(stat.channel_id);
                      const links = getChannelLinks(stat.channel_id);
                      const totalClics = links.reduce((acc, l) => acc + l.clickCount, 0);
                      const isSelected = selectedChannelId === stat.channel_id;

                      return (
                        <tr
                          key={stat.id}
                          className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`}
                        >
                          <td className="py-3 px-4">
                            <p className="font-medium text-gray-900">{getChannelLabel(stat)}</p>
                            {detail?.phone_number && (
                              <p className="text-xs text-gray-400 mt-0.5">{detail.phone_number}</p>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <ProviderBadge provider={detail?.provider} />
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-gray-800">
                            {stat.nb_chats_actifs.toLocaleString('fr-FR')}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-gray-800">
                            {stat.nb_messages.toLocaleString('fr-FR')}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">{links.length}</td>
                          <td className="py-3 px-4 text-right text-gray-600">
                            {totalClics.toLocaleString('fr-FR')}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => openDetail(stat.channel_id)}
                              aria-label={`Voir détail de ${getChannelLabel(stat)}`}
                              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors ml-auto"
                            >
                              Détail
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ONGLET DÉTAIL ──────────────────────────────────────────────────── */}
      {activeTab === 'detail' && (
        <div className="space-y-5">
          {/* Filtres canal + dates */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400" />
              Sélection du canal et de la période
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Sélecteur de canal */}
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Canal</label>
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">— Sélectionner un canal —</option>
                  {channelDetails.map((ch) => (
                    <option key={ch.id} value={ch.channel_id}>
                      {ch.label ?? ch.channel_id}
                      {ch.phone_number ? ` (${ch.phone_number})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date début */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Du
                </label>
                <input
                  type="date"
                  value={detailDateFrom}
                  max={detailDateTo || today}
                  onChange={(e) => setDetailDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Date fin */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Au
                </label>
                <input
                  type="date"
                  value={detailDateTo}
                  min={detailDateFrom || undefined}
                  max={today}
                  onChange={(e) => setDetailDateTo(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Info canal sélectionné */}
            {selectedChannelDetail && (
              <div className="mt-4 flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <ProviderBadge provider={selectedChannelDetail.provider} />
                <span className="text-sm font-medium text-gray-700">
                  {selectedChannelDetail.label ?? selectedChannelId}
                </span>
                {selectedChannelDetail.phone_number && (
                  <span className="text-xs text-gray-400">{selectedChannelDetail.phone_number}</span>
                )}
                {selectedChannelDetail.is_business && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Business</span>
                )}
              </div>
            )}
          </div>

          {/* Aucun canal sélectionné */}
          {!selectedChannelId && (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 py-20 flex flex-col items-center gap-3 text-gray-400">
              <BarChart3 className="w-10 h-10 opacity-40" />
              <p className="text-sm font-medium">Sélectionnez un canal pour afficher ses statistiques</p>
              <p className="text-xs">Ou cliquez sur "Détail" dans l'onglet Résumé</p>
            </div>
          )}

          {/* Spinner */}
          {selectedChannelId && detailLoading && (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          )}

          {/* Erreur détail */}
          {selectedChannelId && detailError && !detailLoading && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 flex-shrink-0" />
              {detailError}
            </div>
          )}

          {/* Stats */}
          {selectedChannelId && detailStats && !detailLoading && (
            <div className="space-y-5">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KpiCard
                  label="Conversations"
                  value={detailStats.conversations_total.toLocaleString('fr-FR')}
                  icon={<MessageCircle className="w-5 h-5 text-teal-600" />}
                  colorBg="bg-teal-100"
                  rows={[
                    { label: 'Actives', value: detailStats.conversations_actif.toLocaleString('fr-FR'), color: 'text-green-600' },
                    { label: 'En attente', value: detailStats.conversations_attente.toLocaleString('fr-FR'), color: 'text-amber-600' },
                    { label: 'Fermées', value: detailStats.conversations_ferme.toLocaleString('fr-FR'), color: 'text-gray-500' },
                  ]}
                />
                <KpiCard
                  label="Messages"
                  value={detailStats.messages_total.toLocaleString('fr-FR')}
                  icon={
                    <span className="flex gap-0.5">
                      <ArrowDownLeft className="w-4 h-4 text-green-600" />
                      <ArrowUpRight className="w-4 h-4 text-blue-600" />
                    </span>
                  }
                  colorBg="bg-blue-100"
                  rows={[
                    { label: 'Entrants (IN)', value: detailStats.messages_in.toLocaleString('fr-FR'), color: 'text-green-600' },
                    { label: 'Sortants (OUT)', value: detailStats.messages_out.toLocaleString('fr-FR'), color: 'text-blue-600' },
                  ]}
                />
                <KpiCard
                  label="Liens campagne"
                  value={detailStats.links_count}
                  icon={<Link2 className="w-5 h-5 text-purple-600" />}
                  colorBg="bg-purple-100"
                  rows={[
                    { label: 'Clics totaux', value: detailStats.links_clicks_total.toLocaleString('fr-FR'), color: 'text-purple-600' },
                    { label: 'Conversions', value: detailStats.links_conversions_total.toLocaleString('fr-FR'), color: 'text-indigo-600' },
                    {
                      label: 'Taux de conv.',
                      value: detailStats.links_clicks_total > 0
                        ? `${Math.round((detailStats.links_conversions_total / detailStats.links_clicks_total) * 100)}%`
                        : '—',
                    },
                  ]}
                />
              </div>

              {/* Graphique temporel */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Évolution des messages sur la période</h3>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="Entrants" stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Sortants" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Total" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">
                    Aucune donnée temporelle pour cette période
                  </p>
                )}
              </div>

              {/* Tableau liens campagne enrichi */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Liens campagne de ce canal
                  </h3>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                    {detailStats.links.length} lien{detailStats.links.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {detailStats.links.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    Aucun lien campagne associé à ce canal
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom</th>
                          <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Clics</th>
                          <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversions</th>
                          <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Taux conv.</th>
                          <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversations</th>
                          <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Msg entrants</th>
                          <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Msg sortants</th>
                          <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {detailStats.links.map((link: ChannelLinkStats) => {
                          const taux = link.clickCount > 0
                            ? Math.round((link.conversionCount / link.clickCount) * 100)
                            : 0;
                          return (
                            <tr key={link.id} className="hover:bg-gray-50 transition-colors">
                              <td className="py-3 px-4 font-medium text-gray-900 max-w-[160px] truncate">
                                {link.name}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-gray-800">
                                {link.clickCount.toLocaleString('fr-FR')}
                              </td>
                              <td className="py-3 px-4 text-right text-gray-700">
                                {link.conversionCount.toLocaleString('fr-FR')}
                              </td>
                              <td className="py-3 px-4 text-right text-gray-600">
                                {taux}%
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="inline-flex items-center gap-1 text-teal-700 font-semibold">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  {link.conversations_count.toLocaleString('fr-FR')}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                                  <ArrowDownLeft className="w-3.5 h-3.5" />
                                  {link.messages_in.toLocaleString('fr-FR')}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                  {link.messages_out.toLocaleString('fr-FR')}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${link.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {link.isActive ? 'Actif' : 'Inactif'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
