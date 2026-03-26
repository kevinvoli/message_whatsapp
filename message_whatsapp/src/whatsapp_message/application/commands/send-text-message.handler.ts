import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { SendTextMessageCommand } from 'src/application/commands/send-text-message.command';
import { OutboundMessageService } from 'src/whatsapp_message/services/outbound-message.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

@CommandHandler(SendTextMessageCommand)
export class SendTextMessageHandler
  implements ICommandHandler<SendTextMessageCommand, WhatsappMessage>
{
  private readonly logger = new Logger(SendTextMessageHandler.name);

  constructor(private readonly outboundService: OutboundMessageService) {}

  async execute(command: SendTextMessageCommand): Promise<WhatsappMessage> {
    this.logger.log(`CMD:SendTextMessage chatId=${command.chatId}`);
    return this.outboundService.createAgentMessage({
      chat_id: command.chatId,
      text: command.text,
      poste_id: command.posteId,
      timestamp: new Date(),
      channel_id: command.channelId,
      quotedMessageId: command.quotedMessageId,
    });
  }
}
