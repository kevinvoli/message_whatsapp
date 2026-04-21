'use client';

import { useEffect, useState } from 'react';
import { SystemHealth, getSystemHealth } from '../lib/api/system-health.api';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}j`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function ServiceBadge({ status }: { status: 'ok' | 'error' | 'not_configured' }) {
  if (status === 'ok') {
    return <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">OK</span>;
  }
  if (status === 'error') {
    return <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">Erreur</span>;
  }
  return <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">Non configuré</span>;
}

function MemoryBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-400' : 'bg-green-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SystemHealthView() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      setHealth(await getSystemHealth());
      setError('');
    } catch {
      setError('Impossible de récupérer les données de santé du serveur.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-6 text-gray-500">Chargement…</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Dashboard technique (4.14)</h2>
          <p className="text-sm text-gray-500 mt-1">
            État du serveur — actualisé toutes les 30 secondes.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={refreshing}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {health && (
        <>
          {/* Statut global */}
          <div className={`rounded-xl p-4 border ${health.status === 'healthy' ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${health.status === 'healthy' ? 'bg-green-500' : 'bg-orange-500'}`} />
              <span className={`font-medium ${health.status === 'healthy' ? 'text-green-800' : 'text-orange-800'}`}>
                {health.status === 'healthy' ? 'Serveur opérationnel' : 'Dégradé — vérifiez les services'}
              </span>
              <span className="text-xs text-gray-500 ml-auto">
                {new Date(health.timestamp).toLocaleString('fr-FR')}
              </span>
            </div>
          </div>

          {/* Services */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h3 className="font-medium text-gray-800">Services</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                <span className="text-sm text-gray-700">Base de données</span>
                <ServiceBadge status={health.services.database} />
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                <span className="text-sm text-gray-700">Redis</span>
                <ServiceBadge status={health.services.redis} />
              </div>
            </div>
          </div>

          {/* Mémoire */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-medium text-gray-800">Mémoire</h3>
            <MemoryBar pct={health.memory.heapUsedPct} label={`Heap JS (${health.memory.heapUsedMb} Mo / ${health.memory.heapTotalMb} Mo)`} />
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="text-center bg-gray-50 rounded-lg py-3">
                <p className="text-lg font-semibold text-gray-800">{health.memory.rssMb} Mo</p>
                <p className="text-xs text-gray-500">RSS</p>
              </div>
              <div className="text-center bg-gray-50 rounded-lg py-3">
                <p className="text-lg font-semibold text-gray-800">{health.memory.externalMb} Mo</p>
                <p className="text-xs text-gray-500">Externe</p>
              </div>
              <div className="text-center bg-gray-50 rounded-lg py-3">
                <p className="text-lg font-semibold text-gray-800">{health.memory.heapUsedPct}%</p>
                <p className="text-xs text-gray-500">Heap utilisé</p>
              </div>
            </div>
          </div>

          {/* Infos serveur */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-medium text-gray-800 mb-3">Informations serveur</h3>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-gray-500">Uptime</dt>
              <dd className="font-medium text-gray-800">{formatUptime(health.uptimeSeconds)}</dd>
              <dt className="text-gray-500">Node.js</dt>
              <dd className="font-medium text-gray-800">{health.nodeVersion}</dd>
              <dt className="text-gray-500">Plateforme</dt>
              <dd className="font-medium text-gray-800">{health.platform}</dd>
              <dt className="text-gray-500">PID</dt>
              <dd className="font-medium text-gray-800">{health.pid}</dd>
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
