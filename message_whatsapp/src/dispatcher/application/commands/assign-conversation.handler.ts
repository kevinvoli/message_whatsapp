import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AssignConversationCommand } from 'src/application/commands/assign-conversation.command';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@CommandHandler(AssignConversationCommand)
export class AssignConversationHandler
  implements ICommandHandler<AssignConversationCommand, WhatsappChat | null>
{
  private readonly logger = new Logger(AssignConversationHandler.name);

  constructor(private readonly dispatcherService: DispatcherService) {}

  async execute(
    command: AssignConversationCommand,
  ): Promise<WhatsappChat | null> {
    this.logger.log(
      `CMD:AssignConversation chatId=${command.chatId} trace=${command.traceId}`,
    );
    return this.dispatcherService.assignConversation(
      command.chatId,
      command.fromName,
      command.traceId,
      command.tenantId,
    );
  }
}
