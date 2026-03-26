import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { UpdateMessageStatusCommand } from 'src/application/commands/update-message-status.command';
import { InboundMessageService } from 'src/webhooks/inbound-message.service';

@CommandHandler(UpdateMessageStatusCommand)
export class UpdateMessageStatusHandler
  implements ICommandHandler<UpdateMessageStatusCommand, void>
{
  private readonly logger = new Logger(UpdateMessageStatusHandler.name);

  constructor(private readonly inboundService: InboundMessageService) {}

  async execute(command: UpdateMessageStatusCommand): Promise<void> {
    this.logger.log(
      `CMD:UpdateMessageStatus count=${command.statuses.length}`,
    );
    await this.inboundService.handleStatuses(command.statuses);
  }
}
