import { Injectable, Logger } from '@nestjs/common';
import { QueueService } from 'src/dispatcher/services/queue.service';
import { RealtimeServerService } from '../realtime-server.service';

@Injectable()
export class QueuePublisher {
  private readonly logger = new Logger(QueuePublisher.name);

  constructor(
    private readonly realtimeServer: RealtimeServerService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Émet une mise à jour de la file d'attente.
   * - Si `targetPosteIds` est fourni, envoie uniquement aux postes connectés.
   * - Sans `targetPosteIds`, diffuse à tous les clients connectés.
   */
  async emit(reason: string, targetPosteIds?: string[]): Promise<void> {
    const queue = await this.queueService.getQueuePositions();
    const server = this.realtimeServer.getServer();
    const payload = {
      timestamp: new Date().toISOString(),
      reason,
      data: queue,
    };

    if (!targetPosteIds || targetPosteIds.length === 0) {
      server.emit('queue:updated', payload);
    } else {
      targetPosteIds.forEach((posteId) => {
        server.to(`poste:${posteId}`).emit('queue:updated', payload);
      });
    }

    this.logger.debug(`Queue update emitted (reason: ${reason})`);
  }
}
