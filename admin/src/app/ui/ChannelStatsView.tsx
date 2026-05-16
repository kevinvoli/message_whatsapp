"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  X,
  BarChart3,
  MessageCircle,
  Link2,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
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

// ─── Constantes couleurs providers ───────────────────────────────────────────

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
  if (!provider) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
        Inconnu
      </span>
    );
  }
  const colors = PROVIDER_COLORS[provider] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: provider };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
      {colors.label}
    </span>
  );
}

interface KpiMiniCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  colorBg: string;
}

function KpiMiniCard({ label, value, sub, icon, colorBg }: KpiMiniCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start gap-3">
      <div className={`p-2.5 rounded-lg ${colorBg} flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ChannelStatsView({ selectedPeriod, dateFrom, dateTo }: ChannelStatsViewProps) {
  const [channels, setChannels] = useState<StatutChannel[]>([]);
  const [channelDetails, setChannelDetails] = useState<Channel[]>([]);
  const [campaignLinks, setCampaignLinks] = useState<CampaignLink[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [detailStats, setDetailStats] = useState<ChannelDetailStats | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>('tous');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Chargement liste ────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedChannelId(null);
    setDetailStats(null);

    try {
      const [statChannels, allChannels, allLinks] = await Promise.all([
        getStatutChannelsFiltered(selectedPeriod, dateFrom, dateTo),
        getChannels(),
        getCampaignLinks(),
      ]);
      setChannels(statChannels);
      setChannelDetails(allChannels);
      setCampaignLinks(allLinks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, dateFrom, dateTo]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Chargement détail d'un canal ────────────────────────────────────────────

  const fetchChannelDetail = useCallback(async (channelId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetailStats(null);
    setSelectedChannelId(channelId);

    try {
      const stats = await getChannelDetailStats(channelId, selectedPeriod, dateFrom, dateTo);
      setDetailStats(stats);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Erreur lors du chargement du détail');
    } finally {
      setDetailLoading(false);
    }
  }, [selectedPeriod, dateFrom, dateTo]);

  const closeDetail = () => {
    setSelectedChannelId(null);
    setDetailStats(null);
    setDetailError(null);
  };

  // ── Enrichissement des données ──────────────────────────────────────────────

  const getChannelDetail = (channelId: string): Channel | undefined =>
    channelDetails.find((c) => c.channel_id === channelId);

  const getChannelLinks = (channelId: string): CampaignLink[] =>
    campaignLinks.filter((l) => l.channelId === channelId || l.channel?.channel_id === channelId);

  const getChannelLabel = (stat: StatutChannel): string => {
    const detail = getChannelDetail(stat.channel_id);
    return detail?.label ?? stat.label ?? stat.channel_id.slice(0, 14) + '…';
  };

  // ── Filtre provider ─────────────────────────────────────────────────────────

  const filteredChannels = channels.filter((stat) => {
    if (providerFilter === 'tous') return true;
    const detail = getChannelDetail(stat.channel_id);
    return (detail?.provider ?? null) === providerFilter;
  });

  // ── Données graphique temporel ──────────────────────────────────────────────

  const chartData = (detailStats?.temporal ?? []).map((t) => ({
    date: formatDateShort(t.date),
    Entrants: t.messages_in,
    Sortants: t.messages_out,
    Total: t.total,
  }));

  // ── Liens du canal sélectionné ──────────────────────────────────────────────

  const selectedChannelLinks = selectedChannelId ? getChannelLinks(selectedChannelId) : [];

  // ── Canal sélectionné (détail d'en-tête) ───────────────────────────────────

  const selectedStatChannel = selectedChannelId
    ? channels.find((c) => c.channel_id === selectedChannelId)
    : null;

  const selectedDetailChannel = selectedChannelId
    ? getChannelDetail(selectedChannelId)
    : null;

  const selectedChannelLabel = selectedStatChannel
    ? getChannelLabel(selectedStatChannel)
    : selectedChannelId ?? '';

  // ── Rendu ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Statistiques par canal</h1>
        </div>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          aria-label="Rafraîchir les données"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filtre provider */}
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

      {/* Erreur globale */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Spinner chargement initial */}
      {loading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {/* Tableau résumé */}
      {!loading && !error && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Canal</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Provider</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conv. actives</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Messages</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Liens</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Clics</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredChannels.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400 text-sm">
                      Aucun canal disponible pour ce filtre
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
                      className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium text-gray-900 truncate max-w-[200px]">
                          {getChannelLabel(stat)}
                        </p>
                        {detail?.phone_number && (
                          <p className="text-xs text-gray-400 mt-0.5">{detail.phone_number}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <ProviderBadge provider={detail?.provider} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-semibold text-gray-800">
                          {stat.nb_chats_actifs.toLocaleString('fr-FR')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-semibold text-gray-800">
                          {stat.nb_messages.toLocaleString('fr-FR')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">
                        {links.length}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">
                        {totalClics.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => void fetchChannelDetail(stat.channel_id)}
                          aria-label={`Voir le détail du canal ${getChannelLabel(stat)}`}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors ml-auto"
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

      {/* Panneau de détail */}
      {selectedChannelId && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* En-tête du panneau */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <div>
                <h2 className="text-base font-semibold text-gray-900">{selectedChannelLabel}</h2>
                {selectedDetailChannel?.provider && (
                  <div className="mt-0.5">
                    <ProviderBadge provider={selectedDetailChannel.provider} />
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={closeDetail}
              aria-label="Fermer le panneau de détail"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Spinner chargement détail */}
            {detailLoading && (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            )}

            {/* Erreur détail */}
            {detailError && !detailLoading && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 flex-shrink-0" />
                {detailError}
              </div>
            )}

            {/* KPI cards */}
            {detailStats && !detailLoading && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Conversations */}
                  <KpiMiniCard
                    label="Conversations"
                    value={detailStats.conversations_total.toLocaleString('fr-FR')}
                    sub={`${detailStats.conversations_actif} actif · ${detailStats.conversations_attente} attente · ${detailStats.conversations_ferme} fermé`}
                    icon={<MessageCircle className="w-4 h-4 text-teal-600" />}
                    colorBg="bg-teal-100"
                  />
                  {/* Messages */}
                  <KpiMiniCard
                    label="Messages"
                    value={detailStats.messages_total.toLocaleString('fr-FR')}
                    sub={`${detailStats.messages_in} entrants · ${detailStats.messages_out} sortants`}
                    icon={
                      <span className="flex gap-0.5">
                        <ArrowDownLeft className="w-3.5 h-3.5 text-green-600" />
                        <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                      </span>
                    }
                    colorBg="bg-blue-100"
                  />
                  {/* Liens */}
                  <KpiMiniCard
                    label="Liens campagne"
                    value={detailStats.links_count}
                    sub={`${detailStats.links_clicks_total.toLocaleString('fr-FR')} clics · ${detailStats.links_conversions_total.toLocaleString('fr-FR')} conv.`}
                    icon={<Link2 className="w-4 h-4 text-purple-600" />}
                    colorBg="bg-purple-100"
                  />
                </div>

                {/* Graphique temporel */}
                {chartData.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Évolution des messages</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="Entrants"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="Sortants"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="Total"
                          stroke="#a855f7"
                          strokeWidth={1.5}
                          strokeDasharray="5 5"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {chartData.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    Aucune donnée temporelle disponible pour cette période
                  </p>
                )}

                {/* Tableau des liens du canal */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Liens campagne ({selectedChannelLinks.length})
                  </h3>
                  {selectedChannelLinks.length === 0 ? (
                    <p className="text-sm text-gray-400">Aucun lien campagne pour ce canal</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom</th>
                            <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Clics</th>
                            <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversions</th>
                            <th className="text-center py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {selectedChannelLinks.map((link) => (
                            <tr key={link.id} className="hover:bg-gray-50 transition-colors">
                              <td className="py-2.5 px-4 font-medium text-gray-900 truncate max-w-[220px]">
                                {link.name}
                              </td>
                              <td className="py-2.5 px-4 text-right text-gray-700">
                                {link.clickCount.toLocaleString('fr-FR')}
                              </td>
                              <td className="py-2.5 px-4 text-right text-gray-700">
                                {link.conversionCount.toLocaleString('fr-FR')}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                    link.isActive
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {link.isActive ? 'Actif' : 'Inactif'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
