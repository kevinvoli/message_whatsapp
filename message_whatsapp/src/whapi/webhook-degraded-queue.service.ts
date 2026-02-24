import { Injectable, Logger } from '@nestjs/common';

type QueueTask = {
  run: () => Promise<void>;
};

@Injectable()
export class WebhookDegradedQueueService {
  private readonly logger = new Logger(WebhookDegradedQueueService.name);
  private readonly maxQueueSize = 5000;
  private readonly concurrency = 5;

  private readonly queues = new Map<string, QueueTask[]>();
  private readonly inFlight = new Map<string, number>();

  enqueue(provider: string, task: QueueTask): boolean {
    const queue = this.queues.get(provider) ?? [];
    if (queue.length >= this.maxQueueSize) {
      return false;
    }
    queue.push(task);
    this.queues.set(provider, queue);
    this.pump(provider);
    return true;
  }

  private pump(provider: string): void {
    const queue = this.queues.get(provider);
    if (!queue || queue.length === 0) {
      return;
    }
    const running = this.inFlight.get(provider) ?? 0;
    if (running >= this.concurrency) {
      return;
    }

    const task = queue.shift();
    if (!task) {
      return;
    }
    this.queues.set(provider, queue);
    this.inFlight.set(provider, running + 1);

    setImmediate(() => {
      task
        .run()
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Degraded queue task failed (${provider}): ${message}`,
          );
        })
        .finally(() => {
          const current = this.inFlight.get(provider) ?? 1;
          this.inFlight.set(provider, Math.max(0, current - 1));
          this.pump(provider);
        });
    });
  }
}
