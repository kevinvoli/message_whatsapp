import { Injectable } from '@nestjs/common';
import { WhatsappMessage } from './entities/whatsapp_message.entity';
import { WhapiMessage } from 'src/whapi/interface/whapi-webhook.interface';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { UnifiedMessage } from 'src/webhooks/normalization/unified-message';
import { MessageQueryService } from './services/message-query.service';
import { MessageStatusService } from './services/message-status.service';
import { InboundPersistenceService } from './services/inbound-persistence.service';
import { OutboundMessageService } from './services/outbound-message.service';

/**
 * Façade de compatibilité — délègue aux services spécialisés.
 *
 * @deprecated Injecter directement MessageQueryService, MessageStatusService,
 *             InboundPersistenceService ou OutboundMessageService selon le besoin.
 *             Cette classe sera supprimée lors de la Phase C.
 */
@Injectable()
export class WhatsappMessageService {
  constructor(
    private readonly queryService: MessageQueryService,
    private readonly statusService: MessageStatusService,
    private readonly inboundService: InboundPersistenceService,
    private readonly outboundService: OutboundMessageService,
  ) {}

  // ── Outbound ──────────────────────────────────────────────────────────────

  createAgentMessage(
    data: Parameters<OutboundMessageService['createAgentMessage']>[0],
  ) {
    return this.outboundService.createAgentMessage(data);
  }

  createAgentMediaMessage(
    data: Parameters<OutboundMessageService['createAgentMediaMessage']>[0],
  ) {
    return this.outboundService.createAgentMediaMessage(data);
  }

  typingStart(chat_id: string) {
    return this.outboundService.typingStart(chat_id);
  }

  typingStop(chat_id: string) {
    return this.outboundService.typingStop(chat_id);
  }

  // ── Inbound ───────────────────────────────────────────────────────────────

  saveIncomingFromWhapi(message: WhapiMessage, chat: WhatsappChat) {
    return this.inboundService.saveIncomingFromWhapi(message, chat);
  }

  saveIncomingFromUnified(message: UnifiedMessage, chat: WhatsappChat) {
    return this.inboundService.saveIncomingFromUnified(message, chat);
  }

  createInternalMessage(message: any, commercialId?: string) {
    return this.inboundService.createInternalMessage(message, commercialId);
  }

  // ── Status ────────────────────────────────────────────────────────────────

  updateByStatus(
    status: Parameters<MessageStatusService['updateByStatus']>[0],
  ) {
    return this.statusService.updateByStatus(status);
  }

  updateStatusFromUnified(
    status: Parameters<MessageStatusService['updateStatusFromUnified']>[0],
  ) {
    return this.statusService.updateStatusFromUnified(status);
  }

  markIncomingMessagesAsRead(chat_id: string) {
    return this.statusService.markIncomingMessagesAsRead(chat_id);
  }

  updateReactionEmoji(targetProviderMessageId: string, emoji: string) {
    return this.statusService.updateReactionEmoji(targetProviderMessageId, emoji);
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  findLastMessageBychat_id(chat_id: string) {
    return this.queryService.findLastMessageBychat_id(chat_id);
  }

  findLastInboundMessageBychat_id(chat_id: string) {
    return this.queryService.findLastInboundMessageBychat_id(chat_id);
  }

  findByExternalId(externalId: string) {
    return this.queryService.findByExternalId(externalId);
  }

  findIncomingByProviderMessageId(
    provider: 'whapi' | 'meta',
    providerMessageId: string,
  ) {
    return this.queryService.findIncomingByProviderMessageId(
      provider,
      providerMessageId,
    );
  }

  findBychat_id(chat_id: string, limit?: number, offset?: number) {
    return this.queryService.findBychat_id(chat_id, limit, offset);
  }

  findAllByChatId(chat_id: string) {
    return this.queryService.findAllByChatId(chat_id);
  }

  findAll(limit?: number, offset?: number, dateStart?: Date) {
    return this.queryService.findAll(limit, offset, dateStart);
  }

  findByAllByMessageId(id: string) {
    return this.queryService.findByAllByMessageId(id);
  }

  findOneWithMedias(id: string) {
    return this.queryService.findOneWithMedias(id);
  }

  countBychat_id(chat_id: string) {
    return this.queryService.countBychat_id(chat_id);
  }

  countUnreadMessages(chat_id: string) {
    return this.queryService.countUnreadMessages(chat_id);
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappMessage`;
  }
}
