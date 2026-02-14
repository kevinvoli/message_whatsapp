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

  recordReceived(provider: string, tenantId?: string | null): void {
    this.inc(`webhook_received_total|provider=${provider}|tenant=${tenantId ?? 'unknown'}`);
  }

  recordDuplicate(provider: string, tenantId?: string | null): void {
    this.inc(`webhook_duplicate_total|provider=${provider}|tenant=${tenantId ?? 'unknown'}`);
  }

  recordSignatureInvalid(provider: string): void {
    this.inc(`webhook_signature_invalid_total|provider=${provider}`);
  }

  recordTenantResolutionFailed(provider: string): void {
    this.inc(`tenant_resolution_failed_total|provider=${provider}`);
  }

  recordIdempotencyConflict(provider: string, tenantId?: string | null): void {
    this.inc(`idempotency_insert_conflict_total|provider=${provider}|tenant=${tenantId ?? 'unknown'}`);
  }

  recordError(provider: string, tenantId: string | null, errorClass: string): void {
    this.inc(`webhook_error_total|provider=${provider}|tenant=${tenantId ?? 'unknown'}|class=${errorClass}`);
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

    return {
      counters,
      latency,
      generated_at: new Date().toISOString(),
      window_minutes: this.latencyWindowMs / 60000,
    };
  }

  private inc(key: CounterKey): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
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
