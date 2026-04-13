"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react';
import { GoNoGoChecklistItem, GoNoGoGate, GoNoGoGateStatus, WebhookMetricsSnapshot } from '@/app/lib/definitions';
import { formatDate } from '@/app/lib/dateUtils';
import { getWebhookMetrics } from '@/app/lib/api/metrics.api';
import { goNoGoChecklist } from '@/app/data/admin-data';

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

const overallStatus = (gates: GoNoGoGate[], checklist: GoNoGoChecklistItem[]): GoNoGoGateStatus => {
  const allStatuses = [...gates.map((g) => g.status), ...checklist.map((c) => c.status)];
  if (allStatuses.some((s) => s === 'fail')) return 'fail';
  if (allStatuses.some((s) => s === 'warn')) return 'warn';
  if (allStatuses.some((s) => s === 'pending')) return 'pending';
  return 'pass';
};

export default function GoNoGoView({ onRefresh }: Props) {
  const [metrics, setMetrics] = useState<WebhookMetricsSnapshot | null>(null);
  const checklist = goNoGoChecklist;

  const fetchData = useCallback(async () => {
    const data = await getWebhookMetrics();
    setMetrics(data);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const gates = buildSloGates(metrics);
  const global = overallStatus(gates, checklist);
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
