import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { HandleInboundMessageCommand } from 'src/application/commands/handle-inbound-message.command';
import { InboundMessageService } from 'src/webhooks/inbound-message.service';

@CommandHandler(HandleInboundMessageCommand)
export class HandleInboundMessageHandler
  implements ICommandHandler<HandleInboundMessageCommand, void>
{
  private readonly logger = new Logger(HandleInboundMessageHandler.name);

  constructor(private readonly inboundService: InboundMessageService) {}

  async execute(command: HandleInboundMessageCommand): Promise<void> {
    this.logger.log(
      `CMD:HandleInboundMessage count=${command.messages.length}`,
    );
    await this.inboundService.handleMessages(command.messages);
  }
}
