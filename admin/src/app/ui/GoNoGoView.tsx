"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import { CronConfig, GoNoGoChecklistItem, GoNoGoGate, GoNoGoGateStatus, SystemConfigEntry, WebhookMetricsSnapshot } from '@/app/lib/definitions';
import { formatDate } from '@/app/lib/dateUtils';
import { getWebhookMetrics } from '@/app/lib/api/metrics.api';
import { getCronConfigs } from '@/app/lib/api/crons.api';
import { getSystemConfigs } from '@/app/lib/api/system-config.api';
import { goNoGoChecklist } from '@/app/data/admin-data';

// ─── Recommandations GICOP ────────────────────────────────────────────────────

const GICOP_CRON_RULES: { key: string; recetteEnabled: boolean; label: string; reason: string }[] = [
  { key: 'read-only-enforcement',     recetteEnabled: false, label: 'Fermeture automatique',   reason: 'S0-006 — suspendu en recette : évite la fermeture auto qui bypass le rapport GICOP' },
  { key: 'sla-checker',              recetteEnabled: true,  label: 'Vérificateur SLA',        reason: 'Actif — réinjection SLA nécessaire' },
  { key: 'offline-reinject',         recetteEnabled: true,  label: 'Réinjection agents',      reason: 'Actif — réinjection agents hors-ligne' },
  { key: 'orphan-checker',           recetteEnabled: true,  label: 'Rattrapage orphelins',    reason: 'Actif — filet de sécurité conversations sans poste' },
  { key: 'webhook-purge',            recetteEnabled: true,  label: 'Purge webhook',           reason: 'Actif — maintenance courante' },
  { key: 'obligation-quality-check', recetteEnabled: true,  label: 'Qualité messages GICOP', reason: 'Actif — contrôle qualité périodique des messages commerciaux' },
];

const GICOP_FLAG_RULES: { key: string; expectedValue: string; label: string; reason: string }[] = [
  { key: 'FF_STICKY_ASSIGNMENT',     expectedValue: 'true', label: 'Sticky assignment',        reason: 'Réaffectation client fidèle — obligatoire GICOP' },
  { key: 'FF_GICOP_REPORT_REQUIRED',      expectedValue: 'true', label: 'Rapport GICOP obligatoire', reason: 'Bloque la clôture si le rapport GICOP est incomplet' },
  { key: 'SLIDING_WINDOW_ENABLED',        expectedValue: 'true', label: 'Fenêtre glissante',          reason: 'Mode bloc de 10 conversations — obligatoire GICOP' },
  { key: 'FF_CALL_OBLIGATIONS_ENABLED',   expectedValue: 'true', label: 'Obligations d\'appels',      reason: 'Bloque la rotation si les 15 appels GICOP sont incomplets (5 annulés + 5 livrés + 5 sans commande ≥ 90s)' },
];

type Props = {
  onRefresh?: () => void;
};

const statusConfig: Record<
  GoNoGoGateStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  pass: {
    label: 'PASS',
    icon: CheckCircle2,
    className: 'text-green-700 bg-green-50 border-green-200',
  },
  warn: {
    label: 'WARN',
    icon: AlertCircle,
    className: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  fail: {
    label: 'FAIL',
    icon: ShieldAlert,
    className: 'text-red-700 bg-red-50 border-red-200',
  },
  pending: {
    label: 'PENDING',
    icon: Clock3,
    className: 'text-slate-700 bg-slate-50 border-slate-200',
  },
};

const sumMetric = (counters: Record<string, number>, metric: string): number =>
  Object.entries(counters)
    .filter(([key]) => key.startsWith(`${metric}|`) || key === metric)
    .reduce((sum, [, value]) => sum + value, 0);

const buildSloGates = (metrics: WebhookMetricsSnapshot | null): GoNoGoGate[] => {
  if (!metrics) {
    return [
      { id: 'slo-error-rate', title: 'Error rate <= 1%', status: 'pending' },
      { id: 'slo-latency', title: 'Latency p95/p99', status: 'pending' },
      { id: 'signature-enforcement', title: 'Signature enforcement', status: 'pending' },
      { id: 'tenant-resolution', title: 'Tenant resolution', status: 'pending' },
      { id: 'idempotency-conflict', title: 'Idempotency conflicts', status: 'pending' },
    ];
  }

  const counters = metrics.counters ?? {};
  const latency = metrics.latency ?? {};
  const received = sumMetric(counters, 'webhook_received_total');
  const errors = sumMetric(counters, 'webhook_error_total');
  const signatureInvalid = sumMetric(counters, 'webhook_signature_invalid_total');
  const tenantResolutionFailed = sumMetric(counters, 'tenant_resolution_failed_total');
  const idempotencyConflicts = sumMetric(counters, 'idempotency_insert_conflict_total');

  const errorRate = received > 0 ? errors / received : 0;
  const errorStatus: GoNoGoGateStatus =
    errorRate <= 0.01 ? 'pass' : errorRate <= 0.02 ? 'warn' : 'fail';

  const providers = Object.keys(latency);
  const latencyPass = providers.every((provider) => {
    const p95 = latency[provider]?.p95 ?? 0;
    const p99 = latency[provider]?.p99 ?? 0;
    return p95 <= 400 && p99 <= 900;
  });
  const latencyWarn = providers.every((provider) => {
    const p95 = latency[provider]?.p95 ?? 0;
    const p99 = latency[provider]?.p99 ?? 0;
    return p95 <= 600 && p99 <= 1200;
  });
  const latencyStatus: GoNoGoGateStatus =
    providers.length === 0 ? 'pending' : latencyPass ? 'pass' : latencyWarn ? 'warn' : 'fail';

  const signatureStatus: GoNoGoGateStatus =
    signatureInvalid > 0 ? 'pass' : received > 0 ? 'warn' : 'pending';

  const tenantStatus: GoNoGoGateStatus =
    tenantResolutionFailed === 0
      ? 'pass'
      : tenantResolutionFailed <= 3
        ? 'warn'
        : 'fail';

  const idempotencyStatus: GoNoGoGateStatus =
    idempotencyConflicts === 0
      ? 'pass'
      : idempotencyConflicts <= 3
        ? 'warn'
        : 'fail';

  return [
    {
      id: 'slo-error-rate',
      title: 'Error rate <= 1%',
      status: errorStatus,
      detail: `${(errorRate * 100).toFixed(2)}% (errors=${errors}, received=${received})`,
    },
    {
      id: 'slo-latency',
      title: 'Latency p95/p99',
      status: latencyStatus,
      detail:
        providers.length === 0
          ? 'No latency samples'
          : providers
              .map(
                (provider) =>
                  `${provider}: p95=${Math.round(latency[provider]?.p95 ?? 0)}ms p99=${Math.round(latency[provider]?.p99 ?? 0)}ms`,
              )
              .join(' | '),
    },
    {
      id: 'signature-enforcement',
      title: 'Signature enforcement observed',
      status: signatureStatus,
      detail: `signature_invalid_total=${signatureInvalid}`,
    },
    {
      id: 'tenant-resolution',
      title: 'Tenant resolution failures',
      status: tenantStatus,
      detail: `tenant_resolution_failed_total=${tenantResolutionFailed}`,
    },
    {
      id: 'idempotency-conflict',
      title: 'Idempotency conflicts',
      status: idempotencyStatus,
      detail: `idempotency_insert_conflict_total=${idempotencyConflicts}`,
    },
  ];
};

const buildGicopGates = (crons: CronConfig[], configs: SystemConfigEntry[]): GoNoGoGate[] => {
  const gates: GoNoGoGate[] = [];
  if (crons.length === 0 && configs.length === 0) return gates; // pas encore chargé

  for (const rule of GICOP_CRON_RULES) {
    const cron = crons.find((c) => c.key === rule.key);
    if (!cron) continue;
    const ok = cron.enabled === rule.recetteEnabled;
    gates.push({
      id: `gicop-cron-${rule.key}`,
      title: `[GICOP] Cron ${rule.label}`,
      status: ok ? 'pass' : 'fail',
      detail: `Requis: ${rule.recetteEnabled ? 'ON' : 'OFF'} — Actuel: ${cron.enabled ? 'ON' : 'OFF'}`,
    });
  }

  for (const rule of GICOP_FLAG_RULES) {
    const entry = configs.find((c) => c.configKey === rule.key);
    if (!entry) continue;
    const ok = entry.configValue === rule.expectedValue;
    gates.push({
      id: `gicop-flag-${rule.key}`,
      title: `[GICOP] Flag ${rule.label}`,
      status: ok ? 'pass' : 'fail',
      detail: `Requis: ${rule.expectedValue} — Actuel: ${entry.configValue ?? 'non défini'}`,
    });
  }

  return gates;
};

const overallStatus = (gates: GoNoGoGate[], checklist: GoNoGoChecklistItem[]): GoNoGoGateStatus => {
  const allStatuses = [...gates.map((g) => g.status), ...checklist.map((c) => c.status)];
  if (allStatuses.some((s) => s === 'fail')) return 'fail';
  if (allStatuses.some((s) => s === 'warn')) return 'warn';
  if (allStatuses.some((s) => s === 'pending')) return 'pending';
  return 'pass';
};

export default function GoNoGoView({ onRefresh }: Props) {
  const [metrics, setMetrics] = useState<WebhookMetricsSnapshot | null>(null);
  const [crons, setCrons]     = useState<CronConfig[]>([]);
  const [configs, setConfigs] = useState<SystemConfigEntry[]>([]);
  const [loadingGicop, setLoadingGicop] = useState(false);
  const checklist = goNoGoChecklist;

  const fetchData = useCallback(async () => {
    const data = await getWebhookMetrics();
    setMetrics(data);
  }, []);

  const fetchGicop = useCallback(async () => {
    setLoadingGicop(true);
    try {
      const [cronData, configData] = await Promise.all([getCronConfigs(), getSystemConfigs()]);
      setCrons(cronData);
      setConfigs(configData);
    } finally {
      setLoadingGicop(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    void fetchGicop();
  }, [fetchData, fetchGicop]);

  const gates = buildSloGates(metrics);
  const gicoGates = buildGicopGates(crons, configs);
  const global = overallStatus([...gates, ...gicoGates], checklist);
  const globalConfig = statusConfig[global];
  const GlobalIcon = globalConfig.icon;

  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-lg border ${globalConfig.className}`}>
        <div className="flex items-center gap-2">
          <GlobalIcon className="w-5 h-5" />
          <span className="text-sm font-semibold">Decision</span>
        </div>
        <div className="mt-2 text-2xl font-semibold">
          {global === 'pass' ? 'GO' : global === 'warn' ? 'NO-GO (warn)' : global === 'pending' ? 'NO-GO (pending)' : 'NO-GO'}
        </div>
        {metrics && (
          <p className="text-xs mt-1">
            Window {metrics.window_minutes} min • {formatDate(metrics.generated_at)}
          </p>
        )}
          <button
            type="button"
            onClick={() => void fetchData()}
            className="mt-3 px-3 py-1 text-xs rounded-full border border-current"
          >
            Refresh
          </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">SLO and security gates</h3>
        <div className="grid grid-cols-1 gap-3">
          {gates.map((gate) => {
            const cfg = statusConfig[gate.status];
            const Icon = cfg.icon;
            return (
              <div key={gate.id} className={`p-3 rounded-lg border ${cfg.className}`}>
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-semibold">{gate.title}</span>
                  <span className="ml-auto text-xs font-semibold">{cfg.label}</span>
                </div>
                {gate.detail && <p className="text-xs mt-1">{gate.detail}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section GICOP Readiness ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">GICOP — Matrice crons (recette)</h3>
          <button onClick={() => void fetchGicop()} disabled={loadingGicop}
            className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingGicop ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-400 uppercase text-left border-b">
            <tr>
              <th className="py-2">Cron</th>
              <th className="py-2 text-center">Requis (recette)</th>
              <th className="py-2 text-center">Actuel</th>
              <th className="py-2 text-center">Statut</th>
              <th className="py-2">Raison</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {GICOP_CRON_RULES.map((rule) => {
              const cron = crons.find((c) => c.key === rule.key);
              const currentEnabled = cron?.enabled ?? null;
              const ok = currentEnabled === rule.recetteEnabled;
              const unknown = currentEnabled === null;
              return (
                <tr key={rule.key} className={ok ? 'bg-green-50/40' : unknown ? '' : 'bg-red-50/40'}>
                  <td className="py-2 pr-2 font-mono text-xs text-gray-800">{rule.key}</td>
                  <td className="py-2 text-center">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rule.recetteEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {rule.recetteEnabled ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  <td className="py-2 text-center">
                    {unknown
                      ? <span className="text-xs text-gray-400">—</span>
                      : <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${currentEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {currentEnabled ? 'ON' : 'OFF'}
                        </span>
                    }
                  </td>
                  <td className="py-2 text-center">
                    {unknown
                      ? <Clock3 className="w-4 h-4 text-gray-400 mx-auto" />
                      : ok
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                      : <ShieldAlert className="w-4 h-4 text-red-500 mx-auto" />
                    }
                  </td>
                  <td className="py-2 text-xs text-gray-500">{rule.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-gray-400">
          Crons internes non contrôlables ici (à vérifier manuellement) :
          <code className="ml-1 bg-gray-100 px-1 rounded">ValidationEngineService.handleExternalCriterionTimeout</code>
          {' · '}
          <code className="bg-gray-100 px-1 rounded">FlowPollingJob.pollQueueWait/pollInactivity</code>
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">GICOP — Feature flags requis</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-400 uppercase text-left border-b">
            <tr>
              <th className="py-2">Flag</th>
              <th className="py-2 text-center">Valeur requise</th>
              <th className="py-2 text-center">Valeur actuelle</th>
              <th className="py-2 text-center">Statut</th>
              <th className="py-2">Raison</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {GICOP_FLAG_RULES.map((rule) => {
              const entry = configs.find((c) => c.configKey === rule.key);
              const current = entry?.configValue ?? null;
              const ok = current === rule.expectedValue;
              const unknown = current === null;
              return (
                <tr key={rule.key} className={ok ? 'bg-green-50/40' : unknown ? '' : 'bg-red-50/40'}>
                  <td className="py-2 pr-2 font-mono text-xs text-gray-800">{rule.key}</td>
                  <td className="py-2 text-center">
                    <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{rule.expectedValue}</code>
                  </td>
                  <td className="py-2 text-center">
                    {unknown
                      ? <span className="text-xs text-gray-400">non défini</span>
                      : <code className={`text-xs px-1.5 py-0.5 rounded ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{current}</code>
                    }
                  </td>
                  <td className="py-2 text-center">
                    {unknown
                      ? <Clock3 className="w-4 h-4 text-gray-400 mx-auto" />
                      : ok
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                      : <ShieldAlert className="w-4 h-4 text-red-500 mx-auto" />
                    }
                  </td>
                  <td className="py-2 text-xs text-gray-500">{rule.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Test outcomes</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2">Test</th>
                <th className="py-2">Owner</th>
                <th className="py-2">Status</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {checklist.map((item) => {
                const cfg = statusConfig[item.status];
                return (
                  <tr key={item.id} className="border-t">
                    <td className="py-2 font-medium text-gray-900">{item.title}</td>
                    <td className="py-2">{item.owner}</td>
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${cfg.className}`}>
                        <cfg.icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600">{item.detail ?? '-'}</td>
                  </tr>
                );
              })}
              {checklist.length === 0 && (
                <tr>
                  <td className="py-2 text-gray-500" colSpan={4}>No checklist items.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
