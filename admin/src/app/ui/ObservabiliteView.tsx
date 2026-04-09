"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { WebhookMetricsSnapshot } from '@/app/lib/definitions';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatDate } from '@/app/lib/dateUtils';
import { getWebhookMetrics } from '@/app/lib/api';

type Props = {
  onRefresh?: () => void;
};

const fmt = (value: number) => Number.isFinite(value) ? value : 0;

type TenantMetric = {
  tenant: string;
  received: number;
  errors: number;
  duplicates: number;
  idempotencyConflicts: number;
  errorRate: number;
};

export default function ObservabiliteView({ onRefresh }: Props) {
  const [metrics, setMetrics] = useState<WebhookMetricsSnapshot | null>(null);

  const fetchData = useCallback(async () => {
    const data = await getWebhookMetrics();
    setMetrics(data);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const counters = metrics?.counters ?? {};
  const latency = metrics?.latency ?? {};

  const providers = Object.keys(latency);
  const tenantCounts = extractTenantMetric(counters, 'webhook_received_total');
  const tenantErrors = extractTenantMetric(counters, 'webhook_error_total');
  const tenantDuplicates = extractTenantMetric(counters, 'webhook_duplicate_total');
  const tenantIdempotency = extractTenantMetric(counters, 'idempotency_insert_conflict_total');
  const tenantMetrics: TenantMetric[] = buildTenantMetrics({
    received: tenantCounts,
    errors: tenantErrors,
    duplicates: tenantDuplicates,
    idempotencyConflicts: tenantIdempotency,
  });

  const topTenants = Object.entries(tenantCounts)
    .filter(([tenant]) => tenant !== 'unknown')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topTenantsErrors = Object.entries(tenantErrors)
    .filter(([tenant]) => tenant !== 'unknown')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const errorRate =
    rate(counters, 'webhook_error_total') /
    Math.max(rate(counters, 'webhook_received_total'), 1);
  const errorSloOk = errorRate <= 0.01;

  const latencySloOk = providers.every((provider) => {
    const p95 = latency[provider]?.p95 ?? 0;
    const p99 = latency[provider]?.p99 ?? 0;
    return p95 <= 400 && p99 <= 900;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Observabilité Webhook</h2>
          {metrics && (
            <p className="text-xs text-gray-500 mt-1">
              Fenêtre {metrics.window_minutes} min • {formatDate(metrics.generated_at)}
            </p>
          )}
        </div>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
            title="Rafraîchir"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={`p-4 rounded-lg border ${errorSloOk ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex items-center gap-2">
            {errorSloOk ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
            <span className="text-sm font-semibold text-gray-900">SLO Error Rate</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {`${(errorRate * 100).toFixed(2)}%`} (seuil 1%)
          </p>
        </div>

        <div className={`p-4 rounded-lg border ${latencySloOk ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex items-center gap-2">
            {latencySloOk ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
            <span className="text-sm font-semibold text-gray-900">SLO Latence</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">p95 ≤ 400 ms • p99 ≤ 900 ms</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Par provider</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2">Provider</th>
                <th className="py-2">p95</th>
                <th className="py-2">p99</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider} className="border-t">
                  <td className="py-2 font-medium text-gray-900">{provider}</td>
                  <td className="py-2">{fmt(latency[provider]?.p95)} ms</td>
                  <td className="py-2">{fmt(latency[provider]?.p99)} ms</td>
                </tr>
              ))}
              {providers.length === 0 && (
                <tr>
                  <td className="py-2 text-gray-500" colSpan={3}>Aucune donnée.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Par tenant (détails)</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-700">
                <th className="py-2">Tenant</th>
                <th className="py-2">Received</th>
                <th className="py-2">Errors</th>
                <th className="py-2">Duplicates</th>
                <th className="py-2">Idempotency</th>
                <th className="py-2">Error rate</th>
              </tr>
            </thead>
            <tbody>
              {tenantMetrics.map((row) => (
                <tr key={row.tenant} className="border-t">
                  <td className="py-2 font-medium text-gray-900">{row.tenant}</td>
                  <td className="py-2">{row.received}</td>
                  <td className="py-2">{row.errors}</td>
                  <td className="py-2">{row.duplicates}</td>
                  <td className="py-2">{row.idempotencyConflicts}</td>
                  <td className="py-2">{(row.errorRate * 100).toFixed(2)}%</td>
                </tr>
              ))}
              {tenantMetrics.length === 0 && (
                <tr>
                  <td className="py-2 text-gray-700" colSpan={6}>Aucune donnée.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top tenants (trafic)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-700">
                  <th className="py-2">Tenant</th>
                  <th className="py-2">Received</th>
                </tr>
              </thead>
              <tbody>
                {topTenants.map(([tenant, count]) => (
                  <tr key={tenant} className="border-t">
                    <td className="py-2 font-medium text-gray-900">{tenant}</td>
                    <td className="py-2">{count}</td>
                  </tr>
                ))}
                {topTenants.length === 0 && (
                  <tr>
                    <td className="py-2 text-gray-700" colSpan={2}>Aucune donnée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top tenants (erreurs)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-700">
                  <th className="py-2">Tenant</th>
                  <th className="py-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {topTenantsErrors.map(([tenant, count]) => (
                  <tr key={tenant} className="border-t">
                    <td className="py-2 font-medium text-gray-900">{tenant}</td>
                    <td className="py-2">{count}</td>
                  </tr>
                ))}
                {topTenantsErrors.length === 0 && (
                  <tr>
                    <td className="py-2 text-gray-700" colSpan={2}>Aucune donnée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function rate(counters: Record<string, number>, metric: string): number {
  return Object.entries(counters)
    .filter(([key]) => key.startsWith(metric))
    .reduce((sum, [, value]) => sum + value, 0);
}

function extractTenantMetric(
  counters: Record<string, number>,
  metric: string,
): Record<string, number> {
  return Object.entries(counters)
    .filter(([key]) => key.startsWith(`${metric}|`))
    .reduce<Record<string, number>>((acc, [key, value]) => {
      const parts = key.split('|');
      const tenant = parts.find((p) => p.startsWith('tenant='))?.split('=')[1] ?? 'unknown';
      acc[tenant] = (acc[tenant] ?? 0) + value;
      return acc;
    }, {});
}


function buildTenantMetrics(input: {
  received: Record<string, number>;
  errors: Record<string, number>;
  duplicates: Record<string, number>;
  idempotencyConflicts: Record<string, number>;
}): TenantMetric[] {
  const tenants = new Set<string>([
    ...Object.keys(input.received),
    ...Object.keys(input.errors),
    ...Object.keys(input.duplicates),
    ...Object.keys(input.idempotencyConflicts),
  ]);
  return Array.from(tenants)
    .filter((tenant) => tenant !== 'unknown')
    .map((tenant) => {
      const received = input.received[tenant] ?? 0;
      const errors = input.errors[tenant] ?? 0;
      return {
        tenant,
        received,
        errors,
        duplicates: input.duplicates[tenant] ?? 0,
        idempotencyConflicts: input.idempotencyConflicts[tenant] ?? 0,
        errorRate: received > 0 ? errors / received : 0,
      };
    })
    .sort((a, b) => b.received - a.received);
}
