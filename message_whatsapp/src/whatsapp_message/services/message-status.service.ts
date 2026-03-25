import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import {
  WhatsappMessage,
  WhatsappMessageStatus,
} from '../entities/whatsapp_message.entity';

/**
 * Mutations sur le statut des messages (SENT → DELIVERED → READ, erreurs).
 */
@Injectable()
export class MessageStatusService {
  private readonly logger = new Logger(MessageStatusService.name);

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
  ) {}

  async updateByStatus(status: {
    id: string;
    recipient_id: string;
    status: string;
    errorCode?: number;
    errorTitle?: string;
  }) {
    try {
      const candidateConditions: FindOptionsWhere<WhatsappMessage>[] = [];

      if (status.recipient_id) {
        candidateConditions.push(
          { external_id: status.id, chat_id: status.recipient_id },
          { provider_message_id: status.id, chat_id: status.recipient_id },
        );
      } else {
        candidateConditions.push(
          { external_id: status.id },
          { provider_message_id: status.id },
        );
      }

      const message = await this.messageRepository.findOne({
        where: candidateConditions,
      });

      if (!message) {
        this.logger.warn(
          `Message not found for status update: ${status.id} recipient=${status.recipient_id}`,
        );
        return null;
      }

      message.status = status.status as WhatsappMessageStatus;

      if (status.errorCode !== undefined) {
        message.error_code = status.errorCode;
      }
      if (status.errorTitle !== undefined) {
        message.error_title = status.errorTitle;
      }

      return await this.messageRepository.save(message);
    } catch (error) {
      this.logger.error(
        `Failed to update message status: ${status.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error(`Failed to update message status: ${String(error)}`);
    }
  }

  async updateStatusFromUnified(status: {
    providerMessageId: string;
    recipientId: string;
    status: string;
    provider?: string;
    errorCode?: number;
    errorTitle?: string;
  }) {
    return this.updateByStatus({
      id: status.providerMessageId,
      recipient_id: status.recipientId,
      status: status.status,
      errorCode: status.errorCode,
      errorTitle: status.errorTitle,
    });
  }

  async markIncomingMessagesAsRead(chat_id: string): Promise<void> {
    // Ancrage explicite de `timestamp` et updatedAt pour bloquer ON UPDATE CURRENT_TIMESTAMP
    // côté MySQL (le moteur applique ON UPDATE même sur les raw queries).
    await this.messageRepository.query(
      `UPDATE whatsapp_message
       SET status    = 'READ',
           updatedAt = updatedAt,
           \`timestamp\` = \`timestamp\`
       WHERE chat_id = ?
         AND direction = 'IN'
         AND status != 'READ'`,
      [chat_id],
    );
    this.logger.debug(`Incoming messages marked as read for chat ${chat_id}`);
  }
}
