import { FailedMessage } from './types.js';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export const stats = {
  sent: 0,
  networkAccepted: 0,
  networkFailed: 0,
  backendFailed: 0,
  timeout: 0,
  statusCounts: {} as Record<string, number>,

  latencies: [] as number[],
  responses: [] as string[],
  failedMessages: [] as FailedMessage[],

  recordLatency(ms: number) {
    this.latencies.push(ms);
  },

  recordSuccess(res: any) {
    const status = res?.data?.status ?? 'unknown';
    const code = String(res?.status ?? 'unknown');
    this.responses.push(status);
    this.statusCounts[code] = (this.statusCounts[code] ?? 0) + 1;
    this.networkAccepted++;
  },

  recordFailure(error: any, payload: any) {
    const errorType = this.detectErrorType(error);

    const failed: FailedMessage = {
      chatId:
        payload?.messages?.[0]?.chat_id ??
        payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from ??
        'unknown',
      errorType,
      statusCode: error?.statusCode ?? error?.response?.status,
      errorMessage:
        error?.response?.data?.message ||
        error?.message ||
        'Erreur inconnue',
      payload,
      timestamp: Date.now(),
    };

    this.failedMessages.push(failed);

    switch (errorType) {
      case 'timeout':
        this.timeout++;
        break;
      case 'network':
        this.networkFailed++;
        break;
      case 'backend':
        this.backendFailed++;
        break;
    }
  },

  detectErrorType(error: any): FailedMessage['errorType'] {
    if (error?.code === 'ECONNABORTED') return 'timeout';
    if (!error?.response && !error?.statusCode) return 'network';
    const status = error?.response?.status ?? error?.statusCode;
    if (status && status >= 400) return 'backend';
    return 'unknown';
  },

  summary() {
    const total = this.sent;
    const okResponses = this.responses.filter(
      (s) => s === 'ok' || s === 'EVENT_RECEIVED' || s === 'duplicate_ignored',
    ).length;

    const sorted = [...this.latencies].sort((a, b) => a - b);

    return {
      total,
      networkAccepted: this.networkAccepted,
      networkFailed: this.networkFailed,
      backendFailed: this.backendFailed,
      timeout: this.timeout,
      okResponses,
      failedToStore: this.networkAccepted - okResponses,
      acceptanceRate: total > 0 ? `${((this.networkAccepted / total) * 100).toFixed(2)}%` : 'N/A',
      latency_p50: `${percentile(sorted, 50)}ms`,
      latency_p95: `${percentile(sorted, 95)}ms`,
      latency_p99: `${percentile(sorted, 99)}ms`,
      latency_max: sorted.length > 0 ? `${sorted[sorted.length - 1]}ms` : 'N/A',
      statusCounts: this.statusCounts,
    };
  },
};
