import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { FeatureFlagService } from 'src/feature-flags/feature-flag.service';
import { CsatResponse } from './entities/csat-response.entity';
import {
  EVENTS,
  ConversationClosedEvent,
  MessageNotifyNewEvent,
} from 'src/events/events.constants';

const CSAT_SURVEY_TEXT =
  'Comment évaluez-vous notre service aujourd\'hui ?\n\n' +
  '1️⃣ — Insuffisant\n' +
  '3️⃣ — Bien\n' +
  '5️⃣ — Excellent\n\n' +
  'Répondez simplement avec le chiffre correspondant.';

const VALID_SCORES = new Set([1, 2, 3, 4, 5]);
const CSAT_DELAY_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class CsatService {
  private readonly logger = new Logger(CsatService.name);

  constructor(
    @InjectRepository(CsatResponse)
    private readonly csatRepo: Repository<CsatResponse>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly messageService: WhatsappMessageService,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  @OnEvent(EVENTS.CONVERSATION_CLOSED)
  onConversationClosed(payload: ConversationClosedEvent): void {
    if (!this.featureFlagService.isEnabled('FF_CSAT')) return;
    const { chat } = payload;
    if (chat.csat_sent_at) return; // Already sent for this conversation

    setTimeout(() => {
      void this.sendCsatSurvey(chat);
    }, CSAT_DELAY_MS);
  }

  private async sendCsatSurvey(chat: WhatsappChat): Promise<void> {
    const channelId = chat.last_msg_client_channel_id ?? chat.channel_id;
    if (!channelId) {
      this.logger.warn(`CSAT_SKIP no channel_id for chat=${chat.chat_id}`);
      return;
    }

    try {
      await this.messageService.createAgentMessage({
        chat_id: chat.chat_id,
        text: CSAT_SURVEY_TEXT,
        timestamp: new Date(),
        channel_id: channelId,
        poste_id: null,
      });
      await this.chatRepo.update({ chat_id: chat.chat_id }, { csat_sent_at: new Date() });
      this.logger.log(`CSAT_SENT chat=${chat.chat_id}`);
    } catch (err) {
      this.logger.warn(`CSAT_SEND_ERROR chat=${chat.chat_id}: ${String(err)}`);
    }
  }

  @OnEvent(EVENTS.MESSAGE_NOTIFY_NEW)
  async onNewMessage(payload: MessageNotifyNewEvent): Promise<void> {
    const { message, chat } = payload;
    if (message.from_me) return;
    if (!chat.csat_sent_at) return;
    if (!message.text) return;

    const trimmed = message.text.trim();
    const score = parseInt(trimmed, 10);
    if (!VALID_SCORES.has(score)) return;

    const existing = await this.csatRepo.findOne({ where: { chat_id: chat.chat_id } });
    if (existing) return; // Already recorded

    await this.csatRepo.save({
      chat_id: chat.chat_id,
      tenant_id: chat.tenant_id,
      commercial_id: chat.poste_id,
      score,
    });
    this.logger.log(`CSAT_RECORDED chat=${chat.chat_id} score=${score}`);
  }

  async getStats(): Promise<{
    totalResponses: number;
    averageScore: number | null;
    distribution: Record<number, number>;
    byCommercial: { commercial_id: string; count: number; average: number }[];
  }> {
    const responses = await this.csatRepo.find();

    const totalResponses = responses.length;
    const averageScore = totalResponses > 0
      ? responses.reduce((sum, r) => sum + r.score, 0) / totalResponses
      : null;

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of responses) {
      distribution[r.score] = (distribution[r.score] ?? 0) + 1;
    }

    const byCommercialMap = new Map<string, { count: number; total: number }>();
    for (const r of responses) {
      if (!r.commercial_id) continue;
      const entry = byCommercialMap.get(r.commercial_id) ?? { count: 0, total: 0 };
      entry.count++;
      entry.total += r.score;
      byCommercialMap.set(r.commercial_id, entry);
    }
    const byCommercial = Array.from(byCommercialMap.entries()).map(([id, { count, total }]) => ({
      commercial_id: id,
      count,
      average: total / count,
    }));

    return { totalResponses, averageScore, distribution, byCommercial };
  }
}
