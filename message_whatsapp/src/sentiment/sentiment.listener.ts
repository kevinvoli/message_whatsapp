import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SENTIMENT_QUEUE } from './sentiment.constants';
import type { SentimentJobPayload } from './sentiment.constants';

/**
 * P6.1 — Déclenche l'analyse de sentiment sur chaque message entrant textuel.
 * L'analyse est asynchrone (BullMQ) pour ne pas bloquer le pipeline webhook.
 */
@Injectable()
export class SentimentListener {
  private readonly logger = new Logger(SentimentListener.name);

  constructor(
    @InjectQueue(SENTIMENT_QUEUE)
    private readonly sentimentQueue: Queue<SentimentJobPayload>,
  ) {}

  @OnEvent('message.saved', { async: true })
  async onMessageSaved(payload: { messageId: string; text: string | null; direction: string }) {
    // Analyser uniquement les messages entrants (direction IN) avec du texte
    if (payload.direction !== 'IN' || !payload.text || payload.text.trim().length < 3) {
      return;
    }

    try {
      await this.sentimentQueue.add(
        'analyze',
        { messageId: payload.messageId, text: payload.text },
        { removeOnComplete: true, removeOnFail: { count: 50 } },
      );
    } catch (err) {
      this.logger.error(`Echec enqueue sentiment pour message ${payload.messageId}: ${err}`);
    }
  }
}
