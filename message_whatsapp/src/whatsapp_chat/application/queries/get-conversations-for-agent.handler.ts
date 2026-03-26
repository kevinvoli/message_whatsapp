import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { GetConversationsForAgentQuery } from 'src/application/queries/get-conversations-for-agent.query';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@QueryHandler(GetConversationsForAgentQuery)
export class GetConversationsForAgentHandler
  implements IQueryHandler<GetConversationsForAgentQuery, { data: WhatsappChat[]; total: number }>
{
  private readonly logger = new Logger(GetConversationsForAgentHandler.name);

  constructor(private readonly chatService: WhatsappChatService) {}

  async execute(query: GetConversationsForAgentQuery): Promise<{ data: WhatsappChat[]; total: number }> {
    this.logger.debug(`QRY:GetConversationsForAgent posteId=${query.posteId}`);
    return this.chatService.findAll(
      query.chatId,
      query.limit ?? 50,
      query.offset ?? 0,
      query.dateStart,
      query.posteId,
      query.commercialId,
    );
  }
}
