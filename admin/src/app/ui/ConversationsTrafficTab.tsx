"use client";
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  MessagesSquare, MessageCircle, CheckCircle, Clock, TrendingUp, Zap, CalendarDays, BarChart2,
} from 'lucide-react';
import { Spinner } from '@/app/ui/Spinner';
import { TraficConversationsResponse, TraficConversationsPoint } from '@/app/lib/definitions';

// ----------------------------------------------------------------
//  Sous-composants locaux
// ----------------------------------------------------------------

interface GranulariteToggleProps {
  value: 'heure' | 'jour';
  onChange: (v: 'heure' | 'jour') => void;
}

function GranulariteToggle({ value, onChange }: GranulariteToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-1 gap-1">
      {(['heure', 'jour'] as const).map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          className={[
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            value === g
              ? 'bg-white text-indigo-600 border border-indigo-200 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          ].join(' ')}
        >
          {g === 'heure' ? 'Par heure' : 'Par jour'}
        </button>
      ))}
    </div>
  );
}

interface KpiCardProps {
  title:      string;
  value:      string | number;
  subtitle?:  string;
  icon:       React.ReactNode;
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

function KpiGridConversations({ stats, granularite }: { stats: TraficConversationsResponse['statistiques']; granularite: 'heure' | 'jour' }) {
  const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const picLabel = granularite === 'heure'
    ? String(stats.unite_pic).padStart(2, '0') + ':00'
    : (DOW[stats.unite_pic] ?? String(stats.unite_pic));

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        title="Total conversations"
        value={stats.total.toLocaleString('fr-FR')}
        subtitle="Ouvertes sur la période"
        icon={<MessagesSquare size={16} />}
        colorClass="bg-indigo-50 text-indigo-600"
      />
      <KpiCard
        title="Actives"
        value={stats.actives.toLocaleString('fr-FR')}
        subtitle={`${stats.taux_actives}% du total`}
        icon={<MessageCircle size={16} />}
        colorClass="bg-green-50 text-green-600"
      />
      <KpiCard
        title="Fermées"
        value={stats.fermees.toLocaleString('fr-FR')}
        subtitle={`Taux clôture : ${stats.taux_cloture}%`}
        icon={<CheckCircle size={16} />}
        colorClass="bg-blue-50 text-blue-600"
      />
      <KpiCard
        title="En attente"
        value={stats.en_attente.toLocaleString('fr-FR')}
        subtitle="En attente de traitement"
        icon={<Clock size={16} />}
        colorClass="bg-amber-50 text-amber-600"
      />
      <KpiCard
        title="Moy. / heure"
        value={`${stats.moy_par_heure} conv/h`}
        subtitle={`${stats.unites_actives} créneaux actifs`}
        icon={<Zap size={16} />}
        colorClass="bg-yellow-50 text-yellow-600"
      />
      <KpiCard
        title="Moy. / jour"
        value={`${stats.moy_par_jour} conv/j`}
        subtitle={`Sur ${stats.nb_jours} jour${stats.nb_jours > 1 ? 's' : ''}`}
        icon={<CalendarDays size={16} />}
        colorClass="bg-purple-50 text-purple-600"
      />
      <KpiCard
        title="Créneau de pic"
        value={picLabel}
        subtitle={`${stats.conversations_pic} conversations`}
        icon={<TrendingUp size={16} />}
        colorClass="bg-rose-50 text-rose-600"
      />
      <KpiCard
        title="Taux clôture"
        value={`${stats.taux_cloture}%`}
        subtitle="Conversations fermées"
        icon={<BarChart2 size={16} />}
        colorClass="bg-teal-50 text-teal-600"
      />
    </div>
  );
}

function ConvTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const actives = payload.find(p => p.name === 'Actives')?.value ?? 0;
  const fermees = payload.find(p => p.name === 'Fermées')?.value ?? 0;
  const total   = actives + fermees;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      <p className="text-green-600">Actives : {actives}</p>
      <p className="text-blue-600">Fermées : {fermees}</p>
      <p className="text-gray-700 border-t mt-2 pt-2 font-medium">Total : {total}</p>
    </div>
  );
}

interface ConversationBarChartProps {
  points:         TraficConversationsPoint[];
  granularite:    'heure' | 'jour';
  selectedPeriod: string;
}

function ConversationBarChart({ points, granularite, selectedPeriod }: ConversationBarChartProps) {
  const labels: Record<string, string> = {
    week:  '7 derniers jours',
    month: '30 derniers jours',
    year:  '12 derniers mois',
  };
  const title = granularite === 'heure'
    ? (selectedPeriod === 'today'
        ? "Conversations heure par heure — aujourd'hui"
        : `Moyenne horaire — ${labels[selectedPeriod] ?? selectedPeriod}`)
    : 'Conversations par jour de la semaine';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-800 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={points}
          margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            interval={granularite === 'heure' ? 1 : 0}
          />
          <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={40} />
          <Tooltip content={<ConvTooltip />} />
          <Legend />
          <Bar dataKey="actives" name="Actives" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar dataKey="fermees" name="Fermées" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RepartitionStatuts({ stats }: { stats: TraficConversationsResponse['statistiques'] }) {
  const items = [
    { label: 'Actives',    count: stats.actives,    pct: stats.taux_actives,  color: 'bg-green-500' },
    { label: 'Fermées',    count: stats.fermees,    pct: stats.taux_cloture,  color: 'bg-blue-500'  },
    { label: 'En attente', count: stats.en_attente, pct: stats.total > 0 ? Math.round(stats.en_attente / stats.total * 100) : 0, color: 'bg-amber-500' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-800 mb-4">Répartition par statut</h3>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700">{item.label}</span>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-gray-900">{item.pct}%</span>
                <span className="text-gray-400">{item.count.toLocaleString('fr-FR')} conv.</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`${item.color} h-2 rounded-full transition-all duration-500`}
                style={{ width: `${Math.min(item.pct, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopCreneauxConversations({
  points,
  total,
  granularite,
}: {
  points: TraficConversationsPoint[];
  total: number;
  granularite: 'heure' | 'jour';
}) {
  const top5 = [...points].sort((a, b) => b.total - a.total).slice(0, 5);
  const colTitle  = granularite === 'heure' ? 'Heure' : 'Jour';
  const cardTitle = granularite === 'heure' ? 'Top 5 heures de pic' : 'Top 5 jours de pic';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-800 mb-4">{cardTitle}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 text-gray-500 font-medium">{colTitle}</th>
              <th className="text-right py-2 text-gray-500 font-medium">Total</th>
              <th className="text-right py-2 text-gray-500 font-medium">Actives</th>
              <th className="text-right py-2 text-gray-500 font-medium">Fermées</th>
              <th className="text-right py-2 text-gray-500 font-medium">% total</th>
            </tr>
          </thead>
          <tbody>
            {top5.map((p, idx) => (
              <tr key={p.index} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 font-medium text-gray-800">
                  {idx === 0 ? '🔥 ' : '    '}{p.label}
                </td>
                <td className="py-2 text-right font-semibold text-gray-900">{p.total}</td>
                <td className="py-2 text-right text-green-600">{p.actives}</td>
                <td className="py-2 text-right text-blue-600">{p.fermees}</td>
                <td className="py-2 text-right text-gray-500">
                  {total > 0 ? Math.round((p.total / total) * 100) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
//  Composant principal
// ----------------------------------------------------------------

export interface ConversationsTrafficTabProps {
  loading:             boolean;
  data:                TraficConversationsResponse | null;
  error:               string | null;
  granularite:         'heure' | 'jour';
  onGranulariteChange: (g: 'heure' | 'jour') => void;
  selectedPeriod:      string;
}

export default function ConversationsTrafficTab({
  loading,
  data,
  error,
  granularite,
  onGranulariteChange,
  selectedPeriod,
}: ConversationsTrafficTabProps) {
  const isEmpty = data !== null && data.statistiques.total === 0;

  return (
    <div className="space-y-6">
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
          <MessagesSquare size={36} className="text-gray-300" />
          <p className="text-gray-500 font-medium">Aucune conversation sur cette période</p>
          <p className="text-xs text-gray-400">
            Essayez une plage de dates différente ou vérifiez que les canaux sont actifs.
          </p>
        </div>
      )}

      {data && !isEmpty && (
        <>
          <div className="flex items-center justify-between">
            <GranulariteToggle value={granularite} onChange={onGranulariteChange} />
          </div>
          <KpiGridConversations stats={data.statistiques} granularite={granularite} />
          <ConversationBarChart
            points={data.points}
            granularite={granularite}
            selectedPeriod={selectedPeriod}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RepartitionStatuts stats={data.statistiques} />
            <TopCreneauxConversations
              points={data.points}
              total={data.statistiques.total}
              granularite={granularite}
            />
          </div>
        </>
      )}
    </div>
  );
}
