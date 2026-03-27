import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle, Users, Activity, TrendingUp,
  UserCheck, Clock, Archive, Target,
  Zap, CheckCircle, AlertCircle, Mail,
  ArrowUpRight, ArrowDownRight, BarChart3, RefreshCw
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MetriquesGlobales, PerformanceCommercial, PerformanceTemporelle, StatutChannel, WebhookMetricsSnapshot } from '@/app/lib/definitions';
import { getOverviewMetriques, getWebhookMetrics } from '@/app/lib/api';
import { Spinner } from './Spinner';
import { formatDate } from '@/app/lib/dateUtils';

const PERIODE_LABELS: Record<string, string> = {
  today: "Aujourd'hui",
  week: 'Cette semaine',
  month: 'Ce mois',
  year: 'Cette année',
};

const PERIODE_CHART_LABELS: Record<string, string> = {
  today: 'Activité du jour',
  week: 'Activité sur 7 jours',
  month: 'Activité sur 30 jours',
  year: 'Activité sur 365 jours',
};

interface OverviewViewProps {
  onRefresh?: () => void;
  selectedPeriod?: string;
}

export default function OverviewView({ onRefresh, selectedPeriod = 'today' }: OverviewViewProps) {
  const [metriques, setMetriques] = useState<MetriquesGlobales | null>(null);
  const [performanceCommercial, setPerformanceCommercial] = useState<PerformanceCommercial[]>([]);
  const [statutChannels, setStatutChannels] = useState<StatutChannel[]>([]);
  const [performanceTemporelle, setPerformanceTemporelle] = useState<PerformanceTemporelle[]>([]);
  const [webhookMetrics, setWebhookMetrics] = useState<WebhookMetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewData, webhookData] = await Promise.all([
        getOverviewMetriques(selectedPeriod),
        getWebhookMetrics(),
      ]);
      setMetriques(overviewData.metriques);
      setPerformanceCommercial(overviewData.performanceCommercial);
      setStatutChannels(overviewData.statutChannels);
      setPerformanceTemporelle(overviewData.performanceTemporelle ?? []);
      setWebhookMetrics(webhookData);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Helper functions (defined before useMemo which depends on parseLabels)
  const getStatusColor = (isConnected: boolean) => {
    return isConnected ? 'bg-green-500' : 'bg-gray-400';
  };

  const formatTemps = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes}min`;
  };

  const renderVariation = (key: string) => {
    const val = metriques?.variations?.[key];
    if (val == null) return null;
    const positive = val >= 0;
    return (
      <span className={`text-xs font-medium flex items-center gap-1 ${positive ? 'text-green-600' : 'text-red-600'}`}>
        {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {positive ? '+' : ''}{val}%
      </span>
    );
  };

  const parseLabels = (key: string) => {
    const parts = key.split('|');
    const metric = parts.shift() ?? key;
    const labels: Record<string, string> = {};
    parts.forEach((part) => {
      const [k, v] = part.split('=');
      if (k && v) {
        labels[k] = v;
      }
    });
    return { metric, labels };
  };

  // useMemo must be called before any conditional return (Rules of Hooks)
  const webhookSummary = React.useMemo(() => {
    if (!webhookMetrics) return null;
    const byProvider: Record<string, {
      received: number;
      duplicate: number;
      error: number;
      signature_invalid: number;
      tenant_failed: number;
    }> = {};
    const tenantReceived: Record<string, number> = {};

    Object.entries(webhookMetrics.counters ?? {}).forEach(([key, value]) => {
      const { metric, labels } = parseLabels(key);
      const provider = labels.provider ?? 'unknown';
      const tenant = labels.tenant ?? 'unknown';

      if (!byProvider[provider]) {
        byProvider[provider] = {
          received: 0,
          duplicate: 0,
          error: 0,
          signature_invalid: 0,
          tenant_failed: 0,
        };
      }

      switch (metric) {
        case 'webhook_received_total':
          byProvider[provider].received += value;
          tenantReceived[tenant] = (tenantReceived[tenant] ?? 0) + value;
          break;
        case 'webhook_duplicate_total':
          byProvider[provider].duplicate += value;
          break;
        case 'webhook_error_total':
          byProvider[provider].error += value;
          break;
        case 'webhook_signature_invalid_total':
          byProvider[provider].signature_invalid += value;
          break;
        case 'tenant_resolution_failed_total':
          byProvider[provider].tenant_failed += value;
          break;
        default:
          break;
      }
    });

    const providers = Object.keys(byProvider).map((provider) => ({
      provider,
      ...byProvider[provider],
      latency: webhookMetrics.latency?.[provider] ?? { p95: 0, p99: 0 },
    }));

    const topTenants = Object.entries(tenantReceived)
      .filter(([tenant]) => tenant !== 'unknown')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      providers,
      topTenants,
      generatedAt: webhookMetrics.generated_at,
      windowMinutes: webhookMetrics.window_minutes,
    };
  }, [webhookMetrics]);

  if (loading || !metriques) {
    return <div className="flex justify-center items-center h-full"><Spinner /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void fetchData()}
          title="Rafraîchir"
          aria-label="Rafraîchir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {/* Stats globales principales */}
      <div className="grid grid-cols-5 gap-4">
        {/* Total Messages */}
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-blue-600" />
            </div>
            {renderVariation('totalMessages')}
          </div>
          <h3 className="text-gray-600 text-xs mb-1">Total Messages</h3>
          <p className="text-2xl font-bold text-gray-900">{metriques.totalMessages.toLocaleString()}</p>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-green-600">↑ {metriques.messagesSortants}</span>
            <span className="text-orange-600">↓ {metriques.messagesEntrants}</span>
          </div>
        </div>

        {/* Conversations Actives */}
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-green-600" />
            </div>
            {renderVariation('chatsActifs')}
          </div>
          <h3 className="text-gray-600 text-xs mb-1">Conversations Actives</h3>
          <p className="text-2xl font-bold text-gray-900">{metriques.chatsActifs}</p>
          <p className="text-xs text-gray-500 mt-2">
            {metriques.chatsEnAttente} en attente
          </p>
        </div>

        {/* Commerciaux Connectés */}
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-xs text-purple-600 font-medium">
              {metriques.commerciauxActifs} actifs
            </span>
          </div>
          <h3 className="text-gray-600 text-xs mb-1">Commerciaux en ligne</h3>
          <p className="text-2xl font-bold text-gray-900">{metriques.commerciauxConnectes}</p>
          <p className="text-xs text-gray-500 mt-2">
            sur {metriques.commerciauxTotal} au total
          </p>
        </div>

        {/* Nouveaux Contacts */}
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-orange-600" />
            </div>
            {renderVariation('nouveauxContactsAujourdhui')}
          </div>
          <h3 className="text-gray-600 text-xs mb-1">Nouveaux contacts</h3>
          <p className="text-2xl font-bold text-gray-900">{metriques.nouveauxContactsAujourdhui}</p>
          <p className="text-xs text-gray-500 mt-2">
            {metriques.totalContacts} au total
          </p>
        </div>

        {/* Taux de Réponse */}
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-pink-600" />
            </div>
            {renderVariation('tauxReponse')}
          </div>
          <h3 className="text-gray-600 text-xs mb-1">Taux de réponse</h3>
          <p className="text-2xl font-bold text-gray-900">{metriques.tauxReponse}%</p>
          <p className="text-xs text-gray-500 mt-2">
            Temps moy: {formatTemps(metriques.tempsReponseMoyen)}
          </p>
        </div>
      </div>

      {/* Stats secondaires */}
      <div className="grid grid-cols-7 gap-4">
        {/* Messages période */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-semibold text-blue-900">{PERIODE_LABELS[selectedPeriod]}</h4>
          </div>
          <p className="text-xl font-bold text-blue-900">{metriques.messagesAujourdhui}</p>
          <p className="text-xs text-blue-700 mt-1">Messages échangés</p>
        </div>

        {/* Messages en Attente */}
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-lg border border-yellow-200">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-600" />
            <h4 className="text-xs font-semibold text-yellow-900">En Attente</h4>
          </div>
          <p className="text-xl font-bold text-yellow-900">{metriques.messagesEnAttente}</p>
          <p className="text-xs text-yellow-700 mt-1">Messages non traités</p>
        </div>

        {/* Chats non lus */}
        <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4 text-red-600" />
            <h4 className="text-xs font-semibold text-red-900">Non lus</h4>
          </div>
          <p className="text-xl font-bold text-red-900">{metriques.chatsNonLus}</p>
          <p className="text-xs text-red-700 mt-1">Conversations</p>
        </div>

        {/* Postes Actifs */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-green-600" />
            <h4 className="text-xs font-semibold text-green-900">Postes</h4>
          </div>
          <p className="text-xl font-bold text-green-900">{metriques.postesActifs}</p>
          <p className="text-xs text-green-700 mt-1">sur {metriques.totalPostes} postes</p>
        </div>

        {/* Channels */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-purple-600" />
            <h4 className="text-xs font-semibold text-purple-900">Channels</h4>
          </div>
          <p className="text-xl font-bold text-purple-900">{metriques.channelsActifs}</p>
          <p className="text-xs text-purple-700 mt-1">{metriques.totalChannels} configurés</p>
        </div>

        {/* Chats Archivés */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <Archive className="w-4 h-4 text-gray-600" />
            <h4 className="text-xs font-semibold text-gray-900">Archivés</h4>
          </div>
          <p className="text-xl font-bold text-gray-900">{metriques.chatsArchives}</p>
          <p className="text-xs text-gray-700 mt-1">{metriques.chatsFermes} fermés</p>
        </div>

        {/* SLA dépassés */}
        <div className={`bg-gradient-to-br p-4 rounded-lg border ${(metriques.chatsSlaDepasses ?? 0) > 0 ? 'from-red-50 to-red-100 border-red-300' : 'from-gray-50 to-gray-100 border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className={`w-4 h-4 ${(metriques.chatsSlaDepasses ?? 0) > 0 ? 'text-red-600' : 'text-gray-400'}`} />
            <h4 className={`text-xs font-semibold ${(metriques.chatsSlaDepasses ?? 0) > 0 ? 'text-red-900' : 'text-gray-700'}`}>SLA</h4>
          </div>
          <p className={`text-xl font-bold ${(metriques.chatsSlaDepasses ?? 0) > 0 ? 'text-red-900' : 'text-gray-500'}`}>{metriques.chatsSlaDepasses ?? 0}</p>
          <p className={`text-xs mt-1 ${(metriques.chatsSlaDepasses ?? 0) > 0 ? 'text-red-700' : 'text-gray-500'}`}>Dépassés</p>
        </div>
      </div>

      {/* Webhook SLO */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Webhook SLO</h3>
            {webhookSummary && (
              <p className="text-xs text-gray-500 mt-1">
                Fenêtre {webhookSummary.windowMinutes} min • {formatDate(webhookSummary.generatedAt)}
              </p>
            )}
          </div>
        </div>

        {!webhookSummary && (
          <div className="text-sm text-gray-500">Métriques webhook indisponibles.</div>
        )}

        {webhookSummary && (
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2">Provider</th>
                      <th className="py-2">Received</th>
                      <th className="py-2">Duplicates</th>
                      <th className="py-2">Errors</th>
                      <th className="py-2">Signatures</th>
                      <th className="py-2">Tenant Fail</th>
                      <th className="py-2">p95</th>
                      <th className="py-2">p99</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookSummary.providers.map((row) => (
                      <tr key={row.provider} className="border-t">
                        <td className="py-2 font-medium text-gray-900">{row.provider}</td>
                        <td className="py-2 text-gray-700">{row.received}</td>
                        <td className="py-2 text-gray-700">{row.duplicate}</td>
                        <td className="py-2 text-gray-700">{row.error}</td>
                        <td className="py-2 text-gray-700">{row.signature_invalid}</td>
                        <td className="py-2 text-gray-700">{row.tenant_failed}</td>
                        <td className="py-2 text-gray-700">{row.latency.p95} ms</td>
                        <td className="py-2 text-gray-700">{row.latency.p99} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Top tenants</h4>
              <div className="space-y-2">
                {webhookSummary.topTenants.length === 0 && (
                  <p className="text-xs text-gray-500">Aucun trafic tenant.</p>
                )}
                {webhookSummary.topTenants.map(([tenant, count]) => (
                  <div
                    key={tenant}
                    className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                  >
                    <span className="text-xs font-medium text-gray-700">{tenant}</span>
                    <span className="text-xs font-semibold text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Performance Temporelle */}
      {performanceTemporelle && performanceTemporelle.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{PERIODE_CHART_LABELS[selectedPeriod]}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performanceTemporelle}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="periode"
                tick={{ fontSize: 12 }}
                tickFormatter={(val: string) => {
                  const d = new Date(val);
                  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
                }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                labelFormatter={(val) => new Date(String(val)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long'})}
              />
              <Legend />
              <Line type="monotone" dataKey="nb_messages" name="Total messages" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="messages_in" name="Entrants" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="messages_out" name="Sortants" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Graphiques et visualisations */}
      <div className="grid grid-cols-3 gap-6">
        {/* Distribution des Chats par Statut */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Distribution des Chats</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Actifs</span>
                <span className="text-sm font-bold text-green-600">{metriques.chatsActifs}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-500 h-3 rounded-full transition-all"
                  style={{ width: `${(metriques.chatsActifs / metriques.totalChats) * 100}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">En Attente</span>
                <span className="text-sm font-bold text-yellow-600">{metriques.chatsEnAttente}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-yellow-500 h-3 rounded-full transition-all"
                  style={{ width: `${(metriques.chatsEnAttente / metriques.totalChats) * 100}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Fermés</span>
                <span className="text-sm font-bold text-gray-600">{metriques.chatsFermes}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-gray-500 h-3 rounded-full transition-all"
                  style={{ width: `${(metriques.chatsFermes / metriques.totalChats) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Total</span>
              <span className="font-bold text-gray-900">{metriques.totalChats} conversations</span>
            </div>
          </div>
        </div>

        {/* Charge par Poste */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Charge par Poste</h3>
          <div className="space-y-3">
            {metriques.chargePostes.slice(0, 5).map((poste, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-600">
                      {poste.poste_name.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{poste.poste_name}</p>
                    <p className="text-xs text-gray-500">
                      {poste.nb_chats_actifs} actifs / {poste.nb_chats_attente} attente
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{poste.nb_chats}</span>
                  <MessageCircle className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Statut des Channels */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Statut Channels</h3>
          <div className="space-y-3">
            {statutChannels.slice(0, 5).map((channel, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    {channel.channel_id.substring(0, 15)}...
                  </span>
                  <div className={`w-2 h-2 rounded-full ${
                    channel.uptime > 80000 ? 'bg-green-500' : 'bg-yellow-500'
                  }`}></div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{channel.nb_chats_actifs} chats</span>
                  <span>{channel.nb_messages} msgs</span>
                  <span className={channel.is_business ? 'text-blue-600 font-medium' : ''}>
                    {channel.is_business ? 'Business' : 'Personnel'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Performers */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performers — {PERIODE_LABELS[selectedPeriod]}</h3>
        <div className="grid grid-cols-3 gap-4">
          {performanceCommercial
            .sort((a, b) => b.nbMessagesEnvoyes - a.nbMessagesEnvoyes)
            .slice(0, 3)
            .map((commercial, idx) => (
              <div key={commercial.id} className="border border-gray-200 rounded-lg p-4 relative hover:shadow-md transition-shadow">
                {idx === 0 && (
                  <div className="absolute -top-3 -right-3 w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-lg">🏆</span>
                  </div>
                )}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold relative">
                    {commercial.name.substring(0, 2).toUpperCase()}
                    <div className={`absolute bottom-0 right-0 w-3 h-3 ${getStatusColor(commercial.isConnected)} border-2 border-white rounded-full`}></div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{commercial.name}</h4>
                    <p className="text-xs text-gray-500">{commercial.nbMessagesEnvoyes} messages envoyés</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-gray-500">Chats actifs</p>
                    <p className="font-semibold text-gray-900">{commercial.nbChatsActifs}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Taux rép.</p>
                    <p className="font-semibold text-gray-900">{commercial.tauxReponse}%</p>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Alertes et Notifications */}
      <div className="grid grid-cols-3 gap-4">
        {metriques.messagesEnAttente > 10 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-yellow-900 mb-1">Messages en Attente</h4>
              <p className="text-xs text-yellow-700">
                {metriques.messagesEnAttente} messages nécessitent une attention
              </p>
            </div>
          </div>
        )}

        {metriques.chatsNonLus > 5 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <Mail className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-900 mb-1">Chats Non Lus</h4>
              <p className="text-xs text-red-700">
                {metriques.chatsNonLus} conversations ont des messages non lus
              </p>
            </div>
          </div>
        )}

        {metriques.commerciauxConnectes < metriques.commerciauxTotal / 2 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-3">
            <Users className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-orange-900 mb-1">Équipe Réduite</h4>
              <p className="text-xs text-orange-700">
                Seulement {metriques.commerciauxConnectes} commerciaux connectés sur {metriques.commerciauxTotal}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
