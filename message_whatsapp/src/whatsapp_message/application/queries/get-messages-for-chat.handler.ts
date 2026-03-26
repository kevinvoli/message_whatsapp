import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { GetMessagesForChatQuery } from 'src/application/queries/get-messages-for-chat.query';
import { MessageQueryService } from 'src/whatsapp_message/services/message-query.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

@QueryHandler(GetMessagesForChatQuery)
export class GetMessagesForChatHandler
  implements IQueryHandler<GetMessagesForChatQuery, WhatsappMessage[]>
{
  private readonly logger = new Logger(GetMessagesForChatHandler.name);

  constructor(private readonly messageQueryService: MessageQueryService) {}

  async execute(query: GetMessagesForChatQuery): Promise<WhatsappMessage[]> {
    this.logger.debug(`QRY:GetMessagesForChat chatId=${query.chatId}`);
    return this.messageQueryService.findBychat_id(query.chatId);
  }
}
