import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  WhatsappMessage,
  WhatsappMessageStatus,
} from '../entities/whatsapp_message.entity';
import { IMessageRepository } from 'src/domain/repositories/i-message.repository';
import { MESSAGE_REPOSITORY } from 'src/domain/repositories/repository.tokens';

/**
 * Mutations sur le statut des messages (SENT → DELIVERED → READ, erreurs).
 */
@Injectable()
export class MessageStatusService {
  private readonly logger = new Logger(MessageStatusService.name);

  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
  ) {}

  async updateByStatus(status: {
    id: string;
    recipient_id: string;
    status: string;
    errorCode?: number;
    errorTitle?: string;
  }) {
    try {
      const message = await this.messageRepository.findForStatusUpdate(
        status.id,
        status.recipient_id || undefined,
      );

      if (!message) {
        this.logger.warn(
          `Message not found for status update: ${status.id} recipient=${status.recipient_id}`,
        );
        return null;
      }

      message.status = status.status.toLowerCase() as WhatsappMessageStatus;

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
    await this.messageRepository.markIncomingAsRead(chat_id);
    this.logger.debug(`Incoming messages marked as read for chat ${chat_id}`);
  }
}
