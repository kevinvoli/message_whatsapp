import { Injectable, Logger } from '@nestjs/common';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappMessageService } from '../whatsapp_message.service';
import { ContactService } from 'src/contact/contact.service';
import { ChannelService } from 'src/channel/channel.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from '../entities/whatsapp_message.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import {
  mapConversationWithContact,
} from 'src/realtime/mappers/socket-conversation.mapper';

export interface ConversationQueryResult {
  conversations: ReturnType<typeof mapConversationWithContact>[];
  hasMore: boolean;
  nextCursor: { activityAt: string; chatId: string } | null;
}

@Injectable()
export class SocketConversationQueryService {
  private readonly logger = new Logger(SocketConversationQueryService.name);

  constructor(
    private readonly chatService: WhatsappChatService,
    private readonly messageService: WhatsappMessageService,
    private readonly contactService: ContactService,
    private readonly channelService: ChannelService,
  ) {}

  /**
   * Charge les conversations d'un poste avec les métadonnées associées
   * (dernier message, unread count, contact).
   * Appelé par le gateway lors d'une connexion ou d'une requête conversations:get.
   */
  async loadConversationsForPoste(
    posteId: string,
    tenantIds: string[],
    searchTerm?: string,
    cursor?: { activityAt: string; chatId: string },
  ): Promise<ConversationQueryResult> {
    const isFirstPage = !cursor;

    let { chats, hasMore } = await this.chatService.findByPosteId(
      posteId,
      [],
      300,
      cursor,
    );

    if (tenantIds.length > 0) {
      const tenantSet = new Set(tenantIds);
      chats = chats.filter((c) => !c.tenant_id || tenantSet.has(c.tenant_id));
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      chats = chats.filter(
        (c) =>
          c.name.toLowerCase().includes(lowerSearch) ||
          c.chat_id.includes(lowerSearch),
      );
      hasMore = false;
    }

    const chatIds = chats.map((c) => c.chat_id);
    const [lastMsgMap, unreadMap, contactMap] = await Promise.all([
      this.messageService.findLastMessagesBulk(chatIds),
      this.messageService.countUnreadMessagesBulk(chatIds),
      this.contactService.findByChatIds(chatIds),
    ]);

    const conversations = chats.map((chat) =>
      mapConversationWithContact(
        chat,
        lastMsgMap.get(chat.chat_id) ?? null,
        unreadMap.get(chat.chat_id) ?? chat.unread_count ?? 0,
        contactMap.get(chat.chat_id),
      ),
    );

    const last = chats.at(-1);
    const nextCursor =
      hasMore && last
        ? {
            activityAt: (last.last_activity_at ?? last.createdAt).toISOString(),
            chatId: last.chat_id,
          }
        : null;

    return { conversations, hasMore, nextCursor };
  }

  /**
   * Charge les canaux dédiés d'un poste — utilisé pour filtrer les messages affichés.
   */
  getDedicatedChannelIds(posteId: string): Promise<string[]> {
    return this.channelService.getDedicatedChannelIdsForPoste(posteId);
  }

}
