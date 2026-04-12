import { Injectable, Logger } from '@nestjs/common';

type HealthSample = {
  ts: number;
  ok: boolean;
  latencyMs: number;
};

@Injectable()
export class WebhookTrafficHealthService {
  private readonly logger = new Logger(WebhookTrafficHealthService.name);
  private readonly windowMs = 5 * 60 * 1000;
  private readonly minSamples = 20;

  private readonly samples = new Map<string, HealthSample[]>();
  private readonly circuitOpen = new Map<string, boolean>();
  private readonly degraded = new Map<string, boolean>();

  record(provider: string, ok: boolean, latencyMs: number): void {
    const now = Date.now();
    const list = this.samples.get(provider) ?? [];
    list.push({ ts: now, ok, latencyMs });
    this.samples.set(provider, list);
    this.prune(provider, now);
    this.evaluate(provider);
  }

  isCircuitOpen(provider: string): boolean {
    return this.circuitOpen.get(provider) ?? false;
  }

  isDegraded(provider: string): boolean {
    return this.degraded.get(provider) ?? false;
  }

  private prune(provider: string, now: number): void {
    const list = this.samples.get(provider);
    if (!list) return;
    const cutoff = now - this.windowMs;
    while (list.length > 0 && list[0].ts < cutoff) {
      list.shift();
    }
  }

  private evaluate(provider: string): void {
    const list = this.samples.get(provider) ?? [];
    if (list.length < this.minSamples) {
      this.updateState(provider, false, false);
      return;
    }

    const errors = list.filter((s) => !s.ok).length;
    const errorRate = errors / list.length;

    const latencies = list.map((s) => s.latencyMs).sort((a, b) => a - b);
    const p95Index = Math.floor(0.95 * (latencies.length - 1));
    const p95 = latencies[p95Index] ?? 0;

    const circuit = errorRate >= 0.05;
    const degrade = p95 >= 3000; // seuil réaliste pour éviter les faux-positifs

    this.updateState(provider, circuit, degrade, { errorRate, p95, sampleCount: list.length });
  }

  private updateState(
    provider: string,
    circuit: boolean,
    degrade: boolean,
    metrics?: { errorRate: number; p95: number; sampleCount: number },
  ): void {
    const prevCircuit = this.circuitOpen.get(provider) ?? false;
    const prevDegraded = this.degraded.get(provider) ?? false;

    if (prevCircuit !== circuit) {
      this.circuitOpen.set(provider, circuit);
      if (circuit) {
        this.logger.error(
          `CIRCUIT_BREAKER_OPEN provider=${provider} errorRate=${((metrics?.errorRate ?? 0) * 100).toFixed(1)}% samples=${metrics?.sampleCount ?? 0}`,
        );
      } else {
        this.logger.warn(
          `CIRCUIT_BREAKER_CLOSED provider=${provider}`,
        );
      }
    }

    if (prevDegraded !== degrade) {
      this.degraded.set(provider, degrade);
      if (degrade) {
        this.logger.warn(
          `BACKPRESSURE_ENABLED provider=${provider} p95=${metrics?.p95 ?? 0}ms errorRate=${((metrics?.errorRate ?? 0) * 100).toFixed(1)}% samples=${metrics?.sampleCount ?? 0}`,
        );
      } else {
        this.logger.log(
          `BACKPRESSURE_DISABLED provider=${provider} p95=${metrics?.p95 ?? 0}ms`,
        );
      }
    }
  }
}
