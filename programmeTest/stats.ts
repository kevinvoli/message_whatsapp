// stats.ts
export class StatsCollector {
  sent = 0;
  networkAccepted = 0;
  networkFailed = 0;
  timeout = 0;

  start = Date.now();

  summary() {
    const duration = ((Date.now() - this.start) / 1000).toFixed(2);

    return {
      duration: `${duration}s`,
      sent: this.sent,
      networkAccepted: this.networkAccepted,
      networkFailed: this.networkFailed,
      timeout: this.timeout,
      acceptanceRate: `${(
        (this.networkAccepted / this.sent) *
        100
      ).toFixed(2)}%`,
    };
  }
}
