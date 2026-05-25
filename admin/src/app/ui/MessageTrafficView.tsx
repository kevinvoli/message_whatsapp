"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RefreshCw, MessageCircle, ArrowDownLeft, ArrowUpRight, Zap, Clock, CalendarDays, TrendingUp, ArrowLeftRight, Info, Radio } from 'lucide-react';
import { getTraficHoraire } from '@/app/lib/api';
import { TraficHoraireResponse, TraficHorairePoint, TraficStatistiques } from '@/app/lib/definitions';
import { formatRelativeDate } from '@/app/lib/dateUtils';
import { Spinner } from '@/app/ui/Spinner';

const AUTO_REFRESH_MS = 90_000;

interface MessageTrafficViewProps {
  selectedPeriod: string;
  dateFrom?: string;
  dateTo?: string;
}

interface PageHeaderProps {
  onRefresh:   () => void;
  loading:     boolean;
  lastRefresh: Date | null;
  isLive:      boolean;
}

function PageHeader({ onRefresh, loading, lastRefresh, isLive }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">Trafic Messages</h2>
          {isLive && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 border border-green-200 rounded-full px-2 py-0.5">
              <Radio size={10} className="animate-pulse" />
              Live
            </span>
          )}
        </div>
        {lastRefresh && (
          <p className="text-xs text-gray-400 mt-0.5">
            Mis à jour {formatRelativeDate(lastRefresh.toISOString())}
            {isLive && <span className="ml-1">(auto-refresh 90s)</span>}
          </p>
        )}
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Chargement…' : 'Actualiser'}
      </button>
    </div>
  );
}

interface KpiCardProps {
  title:     string;
  value:     string | number;
  subtitle?: string;
  icon:      React.ReactNode;
  colorClass: string;
}

function KpiCard({ title, value, subtitle, icon, colorClass }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function KpiGrid({ stats }: { stats: TraficStatistiques }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        title="Total messages"
        value={stats.total.toLocaleString('fr-FR')}
        subtitle="Sur la période"
        icon={<MessageCircle size={16} />}
        colorClass="bg-indigo-50 text-indigo-600"
      />
      <KpiCard
        title="Messages entrants"
        value={stats.messages_in.toLocaleString('fr-FR')}
        subtitle={`${stats.pourcentage_in}% du total`}
        icon={<ArrowDownLeft size={16} />}
        colorClass="bg-green-50 text-green-600"
      />
      <KpiCard
        title="Messages sortants"
        value={stats.messages_out.toLocaleString('fr-FR')}
        subtitle={`${stats.pourcentage_out}% du total`}
        icon={<ArrowUpRight size={16} />}
        colorClass="bg-blue-50 text-blue-600"
      />
      <KpiCard
        title="Moy. / minute"
        value={`${stats.moy_par_minute} msg/min`}
        subtitle="Sur la durée active"
        icon={<Zap size={16} />}
        colorClass="bg-yellow-50 text-yellow-600"
      />
      <KpiCard
        title="Moy. / heure"
        value={`${stats.moy_par_heure} msg/h`}
        subtitle={`${stats.heures_actives}h actives`}
        icon={<Clock size={16} />}
        colorClass="bg-orange-50 text-orange-600"
      />
      <KpiCard
        title="Moy. / jour"
        value={`${stats.moy_par_jour} msg/j`}
        subtitle={`Sur ${stats.nb_jours} jour${stats.nb_jours > 1 ? 's' : ''}`}
        icon={<CalendarDays size={16} />}
        colorClass="bg-purple-50 text-purple-600"
      />
      <KpiCard
        title="Heure de pic"
        value={`${String(stats.heure_pic).padStart(2, '0')}:00`}
        subtitle={`${stats.messages_pic} messages`}
        icon={<TrendingUp size={16} />}
        colorClass="bg-rose-50 text-rose-600"
      />
      <KpiCard
        title="Ratio IN/OUT"
        value={stats.ratio_in_out}
        subtitle="Entrants / Sortants"
        icon={<ArrowLeftRight size={16} />}
        colorClass="bg-teal-50 text-teal-600"
      />
    </div>
  );
}

function CustomTooltip({ active, payload, label, mode }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  mode: 'journee' | 'periode';
}) {
  if (!active || !payload?.length) return null;
  const inVal  = payload[0]?.value ?? 0;
  const outVal = payload[1]?.value ?? 0;
  const total  = inVal + outVal;
  const suffix = mode === 'periode' ? ' (moy/j)' : '';
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-semibold text-gray-800 mb-2">{label}{suffix}</p>
      <p className="text-green-600">↙️ Entrants : {inVal}</p>
      <p className="text-blue-600">↗️ Sortants : {outVal}</p>
      <p className="text-gray-700 border-t mt-2 pt-2 font-medium">Total : {total}</p>
    </div>
  );
}

function chartTitle(mode: 'journee' | 'periode', nbJours: number, selectedPeriod: string): string {
  if (mode === 'journee') return "Trafic heure par heure — aujourd'hui";
  const labels: Record<string, string> = {
    week:  '7 derniers jours',
    month: '30 derniers jours',
    year:  '12 derniers mois',
  };
  const label = labels[selectedPeriod] ?? `${nbJours} jours`;
  return `Moyenne horaire sur ${label}`;
}

interface TrafficBarChartProps {
  horaire:        TraficHorairePoint[];
  mode:           'journee' | 'periode';
  nbJours:        number;
  selectedPeriod: string;
}

function TrafficBarChart({ horaire, mode, nbJours, selectedPeriod }: TrafficBarChartProps) {
  const chartData = mode === 'periode'
    ? horaire.map(h => ({
        ...h,
        messages_in:  Math.round((h.messages_in  / nbJours) * 10) / 10,
        messages_out: Math.round((h.messages_out / nbJours) * 10) / 10,
      }))
    : horaire;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-800">
          {chartTitle(mode, nbJours, selectedPeriod)}
        </h3>
        {mode === 'periode' && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-flex items-center gap-1 mt-1">
            <Info size={12} />
            Valeurs = moyenne par jour sur {nbJours} jour{nbJours > 1 ? 's' : ''}
          </p>
        )}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="heureLabel"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            interval={1}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#6b7280" }}
            width={40}
            allowDecimals={mode !== 'journee'}
          />
          <Tooltip content={<CustomTooltip mode={mode} />} />
          <Legend />
          <Bar dataKey="messages_in"  name="Entrants" fill="#10b981" radius={[3,3,0,0]} maxBarSize={28} />
          <Bar dataKey="messages_out" name="Sortants"  fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RepartitionJournee({ stats }: { stats: TraficStatistiques }) {
  const tranches = [
    { label: "Nuit",        emoji: "🌙", heures: "00h-06h", pct: stats.concentration_nuit,  total: Math.round(stats.total * stats.concentration_nuit  / 100) },
    { label: "Matin",       emoji: "🌅", heures: "06h-12h", pct: stats.concentration_matin, total: Math.round(stats.total * stats.concentration_matin / 100) },
    { label: "Après-midi",  emoji: "☀️", heures: "12h-18h", pct: stats.concentration_aprem, total: Math.round(stats.total * stats.concentration_aprem / 100) },
    { label: "Soir",        emoji: "🌆", heures: "18h-24h", pct: stats.concentration_soir,  total: Math.round(stats.total * stats.concentration_soir  / 100) },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-800 mb-4">Répartition dans la journée</h3>
      <div className="space-y-4">
        {tranches.map((t) => (
          <div key={t.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700">
                {t.emoji} {t.label} <span className="text-xs text-gray-400">({t.heures})</span>
              </span>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-gray-900">{t.pct}%</span>
                <span className="text-gray-400">{t.total.toLocaleString('fr-FR')} msg</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(t.pct, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopHeures({ horaire, total }: { horaire: TraficHorairePoint[]; total: number }) {
  const top5 = [...horaire]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-800 mb-4">Top 5 heures de pic</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 text-gray-500 font-medium">Heure</th>
              <th className="text-right py-2 text-gray-500 font-medium">Total</th>
              <th className="text-right py-2 text-gray-500 font-medium">Entrants</th>
              <th className="text-right py-2 text-gray-500 font-medium">Sortants</th>
              <th className="text-right py-2 text-gray-500 font-medium">% jour</th>
            </tr>
          </thead>
          <tbody>
            {top5.map((h, idx) => (
              <tr key={h.heure} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 font-medium text-gray-800">
                  {idx === 0 ? '🔥 ' : '    '}{h.heureLabel}
                </td>
                <td className="py-2 text-right font-semibold text-gray-900">{h.total}</td>
                <td className="py-2 text-right text-green-600">{h.messages_in}</td>
                <td className="py-2 text-right text-blue-600">{h.messages_out}</td>
                <td className="py-2 text-right text-gray-500">
                  {total > 0 ? Math.round((h.total / total) * 100) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MessageTrafficView({ selectedPeriod, dateFrom, dateTo }: MessageTrafficViewProps) {
  const [loading, setLoading]         = useState(false);
  const [data, setData]               = useState<TraficHoraireResponse | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTraficHoraire(selectedPeriod, dateFrom, dateTo);
      setData(result);
      setLastRefresh(new Date());
    } catch {
      setError('Erreur lors du chargement du trafic messages');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (selectedPeriod !== 'today') return;

    const silentRefresh = async () => {
      try {
        const result = await getTraficHoraire(selectedPeriod, dateFrom, dateTo);
        setData(result);
        setLastRefresh(new Date());
      } catch {
        // Echec silencieux
      }
    };

    const interval = setInterval(silentRefresh, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [selectedPeriod, dateFrom, dateTo]);

  const isEmpty = data !== null && data.statistiques.total === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        onRefresh={load}
        lastRefresh={lastRefresh}
        loading={loading}
        isLive={selectedPeriod === 'today'}
      />

      {loading && !data && (
        <div className="flex items-center justify-center h-48">
          <Spinner />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {isEmpty && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3">
          <MessageCircle size={36} className="text-gray-300" />
          <p className="text-gray-500 font-medium">Aucun message sur cette période</p>
          <p className="text-xs text-gray-400">
            Essayez une plage de dates différente ou vérifiez que les canaux sont actifs.
          </p>
        </div>
      )}

      {data && !isEmpty && (
        <>
          <KpiGrid stats={data.statistiques} />
          <TrafficBarChart
            horaire={data.horaire}
            mode={data.statistiques.mode}
            nbJours={data.statistiques.nb_jours}
            selectedPeriod={selectedPeriod}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RepartitionJournee stats={data.statistiques} />
            <TopHeures horaire={data.horaire} total={data.statistiques.total} />
          </div>
        </>
      )}
    </div>
  );
}
