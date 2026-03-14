import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, MessageCircle, Clock, TrendingUp,
  ArrowUpRight, ArrowDownRight, RefreshCw
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { PerformanceCommercial, PerformanceTemporelle } from '@/app/lib/definitions';
import { getOverviewMetriques } from '@/app/lib/api';
import { Spinner } from './Spinner';

interface PerformanceViewProps {
  onRefresh?: () => void;
  selectedPeriod?: string;
}

export default function PerformanceView({ onRefresh, selectedPeriod = 'today' }: PerformanceViewProps) {
  const [commerciaux, setCommerciaux] = useState<PerformanceCommercial[]>([]);
  const [performanceTemporelle, setPerformanceTemporelle] = useState<PerformanceTemporelle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOverviewMetriques(selectedPeriod);
      setCommerciaux(data.performanceCommercial);
      setPerformanceTemporelle(data.performanceTemporelle ?? []);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="flex justify-center items-center h-full"><Spinner /></div>;
  }

  const sorted = [...commerciaux].sort((a, b) => b.nbMessagesEnvoyes - a.nbMessagesEnvoyes);

  const totalMessages = commerciaux.reduce((s, c) => s + c.nbMessagesEnvoyes + c.nbMessagesRecus, 0);
  const totalChatsActifs = commerciaux.reduce((s, c) => s + c.nbChatsActifs, 0);
  const avgTauxReponse = commerciaux.length
    ? Math.round(commerciaux.reduce((s, c) => s + c.tauxReponse, 0) / commerciaux.length)
    : 0;
  const avgTempsReponse = commerciaux.length
    ? Math.round(commerciaux.reduce((s, c) => s + c.tempsReponseMoyen, 0) / commerciaux.length)
    : 0;

  const formatTemps = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    if (min < 60) return `${min}min`;
    return `${Math.floor(min / 60)}h${min % 60}min`;
  };

  const chartData = sorted.map(c => ({
    name: c.name,
    envoyes: c.nbMessagesEnvoyes,
    recus: c.nbMessagesRecus,
    chats: c.nbChatsActifs,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void fetchData()}
          title="Rafraichir"
          aria-label="Rafraichir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="w-5 h-5 text-blue-600" />
            <h4 className="text-xs font-semibold text-gray-600">Total messages</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalMessages.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-green-600" />
            <h4 className="text-xs font-semibold text-gray-600">Chats actifs</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalChatsActifs}</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <h4 className="text-xs font-semibold text-gray-600">Taux reponse moy.</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900">{avgTauxReponse}%</p>
        </div>
        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-orange-600" />
            <h4 className="text-xs font-semibold text-gray-600">Temps reponse moy.</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatTemps(avgTempsReponse)}</p>
        </div>
      </div>

      {/* Chart - Messages par commercial */}
      {chartData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Messages par commercial</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="envoyes" name="Envoyes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="recus" name="Recus" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Performance temporelle */}
      {performanceTemporelle && performanceTemporelle.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendance sur 7 jours</h3>
          <ResponsiveContainer width="100%" height={250}>
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
                labelFormatter={(val) => new Date(String(val)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              />
              <Legend />
              <Line type="monotone" dataKey="nb_messages" name="Messages" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              {performanceTemporelle[0]?.nb_conversations !== undefined && (
                <Line type="monotone" dataKey="nb_conversations" name="Conversations" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Classement commerciaux */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Classement des commerciaux</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commercial</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Poste</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Msg envoyes</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Msg recus</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Chats actifs</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Taux rep.</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Temps rep.</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sorted.map((c, idx) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-bold text-gray-500">
                    {idx + 1}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {c.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{c.poste_name || '-'}</td>
                  <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">{c.nbMessagesEnvoyes}</td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600">{c.nbMessagesRecus}</td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600">{c.nbChatsActifs}</td>
                  <td className="px-6 py-4 text-sm text-right">
                    <span className={`font-semibold ${c.tauxReponse >= 80 ? 'text-green-600' : c.tauxReponse >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {c.tauxReponse}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600">{formatTemps(c.tempsReponseMoyen)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      c.isConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {c.isConnected ? 'En ligne' : 'Hors ligne'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
