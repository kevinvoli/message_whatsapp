import { Injectable } from '@nestjs/common';

type CounterKey = string;

type LatencySample = {
  ts: number;
  ms: number;
};

@Injectable()
export class WebhookMetricsService {
  private readonly counters = new Map<CounterKey, number>();
  private readonly latencySamples = new Map<string, LatencySample[]>();
  private readonly latencyWindowMs = 15 * 60 * 1000;
  private readonly lastReceivedAt = new Map<string, number>();

  recordReceived(provider: string, tenantId?: string | null): void {
    this.lastReceivedAt.set(provider, Date.now());
    this.inc(
      `webhook_received_total|provider=${provider}|tenant=${tenantId ?? 'unknown'}`,
    );
  }

  getLastReceivedAt(provider: string): number | undefined {
    return this.lastReceivedAt.get(provider);
  }

  /** Retourne le nombre de secondes depuis le dernier webhook reçu, ou null si aucun. */
  getGapSeconds(provider: string): number | null {
    const last = this.lastReceivedAt.get(provider);
    if (!last) return null;
    return Math.floor((Date.now() - last) / 1000);
  }

  recordDuplicate(provider: string, tenantId?: string | null): void {
    this.inc(
      `webhook_duplicate_total|provider=${provider}|tenant=${tenantId ?? 'unknown'}`,
    );
  }

  recordSignatureInvalid(provider: string): void {
    this.inc(`webhook_signature_invalid_total|provider=${provider}`);
  }

  recordTenantResolutionFailed(provider: string): void {
    this.inc(`tenant_resolution_failed_total|provider=${provider}`);
  }

  recordIdempotencyConflict(provider: string, tenantId?: string | null): void {
    this.inc(
      `idempotency_insert_conflict_total|provider=${provider}|tenant=${tenantId ?? 'unknown'}`,
    );
  }

  recordIdempotencyPurge(total: number): void {
    if (!Number.isFinite(total) || total <= 0) return;
    this.inc(`idempotency_ttl_purge_total`);
    if (total > 1) {
      this.counters.set(
        'idempotency_ttl_purge_total',
        (this.counters.get('idempotency_ttl_purge_total') ?? 1) + (total - 1),
      );
    }
  }

  recordError(
    provider: string,
    tenantId: string | null,
    errorClass: string,
  ): void {
    this.inc(
      `webhook_error_total|provider=${provider}|tenant=${tenantId ?? 'unknown'}|class=${errorClass}`,
    );
  }

  recordLatency(provider: string, ms: number): void {
    const list = this.latencySamples.get(provider) ?? [];
    list.push({ ts: Date.now(), ms });
    this.latencySamples.set(provider, list);
    this.prune(provider);
  }

  snapshot(): Record<string, unknown> {
    const counters: Record<string, number> = {};
    for (const [key, value] of this.counters.entries()) {
      counters[key] = value;
    }

    const latency: Record<string, { p95: number; p99: number }> = {};
    for (const provider of this.latencySamples.keys()) {
      const samples = this.getLatencyValues(provider);
      latency[provider] = {
        p95: this.percentile(samples, 0.95),
        p99: this.percentile(samples, 0.99),
      };
    }

    const gaps: Record<string, number | null> = {};
    for (const provider of this.lastReceivedAt.keys()) {
      gaps[provider] = this.getGapSeconds(provider);
    }

    return {
      counters,
      latency,
      gap_since_last_webhook_seconds: gaps,
      generated_at: new Date().toISOString(),
      window_minutes: this.latencyWindowMs / 60000,
    };
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    const metricTypes: Record<string, 'counter' | 'gauge'> = {
      webhook_received_total: 'counter',
      webhook_duplicate_total: 'counter',
      webhook_signature_invalid_total: 'counter',
      tenant_resolution_failed_total: 'counter',
      webhook_error_total: 'counter',
      idempotency_insert_conflict_total: 'counter',
      idempotency_ttl_purge_total: 'counter',
      webhook_latency_p95_ms: 'gauge',
      webhook_latency_p99_ms: 'gauge',
    };

    const counters = this.snapshot().counters as Record<string, number>;
    const latency = this.snapshot().latency as Record<
      string,
      { p95: number; p99: number }
    >;

    Object.entries(metricTypes).forEach(([name, type]) => {
      lines.push(`# TYPE ${name} ${type}`);
    });

    for (const [key, value] of Object.entries(counters)) {
      const { metric, labels } = this.parseKey(key);
      lines.push(`${metric}${this.formatLabels(labels)} ${value}`);
    }

    for (const [provider, stats] of Object.entries(latency)) {
      lines.push(
        `webhook_latency_p95_ms${this.formatLabels({ provider })} ${stats.p95}`,
      );
      lines.push(
        `webhook_latency_p99_ms${this.formatLabels({ provider })} ${stats.p99}`,
      );
    }

    return lines.join('\n') + '\n';
  }

  private inc(key: CounterKey): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  private parseKey(key: string): {
    metric: string;
    labels: Record<string, string>;
  } {
    const parts = key.split('|');
    const metric = parts.shift() ?? key;
    const labels: Record<string, string> = {};
    for (const part of parts) {
      const [k, v] = part.split('=');
      if (k && v) {
        labels[k] = v;
      }
    }
    return { metric, labels };
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    const rendered = entries
      .map(([k, v]) => `${k}="${String(v).replace(/\"/g, '\\\"')}"`)
      .join(',');
    return `{${rendered}}`;
  }

  private prune(provider: string): void {
    const list = this.latencySamples.get(provider);
    if (!list) return;
    const cutoff = Date.now() - this.latencyWindowMs;
    while (list.length > 0 && list[0].ts < cutoff) {
      list.shift();
    }
  }

  private getLatencyValues(provider: string): number[] {
    const list = this.latencySamples.get(provider) ?? [];
    return list.map((s) => s.ms).sort((a, b) => a - b);
  }

  private percentile(values: number[], q: number): number {
    if (values.length === 0) return 0;
    const idx = Math.floor(q * (values.length - 1));
    return values[idx] ?? 0;
  }
}
