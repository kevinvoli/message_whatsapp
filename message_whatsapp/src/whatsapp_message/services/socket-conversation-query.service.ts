import { Injectable, Logger } from '@nestjs/common';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappMessageService } from '../whatsapp_message.service';
import { ContactService } from 'src/contact/contact.service';
import { ChannelService } from 'src/channel/channel.service';
import { WhatsappChat, WindowStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from '../entities/whatsapp_message.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import {
  mapConversationWithContact,
} from 'src/realtime/mappers/socket-conversation.mapper';
import { ValidationEngineService } from 'src/window/services/validation-engine.service';

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
    private readonly validationEngine: ValidationEngineService,
  ) {}

  /**
   * Charge la fenêtre de 50 conversations d'un poste (fenêtre glissante).
   * La liste est bornée à 50 et triée par window_slot ASC.
   * Plus de pagination keyset pour la vue commerciale.
   */
  async loadConversationsForPoste(
    posteId: string,
    tenantIds: string[],
    searchTerm?: string,
    // cursor conservé pour compatibilité API mais ignoré — fenêtre fixe
    _cursor?: { activityAt: string; chatId: string },
  ): Promise<ConversationQueryResult> {
    let { chats } = await this.chatService.findByPosteId(
      posteId,
      [],
      50, // fenêtre fixe maximale
    );

    if (tenantIds.length > 0) {
      const tenantSet = new Set(tenantIds);
      chats = chats.filter((c) => !c.tenant_id || tenantSet.has(c.tenant_id));
    }

    // Trier : conversations avec window_slot en premier (1→50), puis sans slot par activité
    chats.sort((a, b) => {
      if (a.window_slot != null && b.window_slot != null) return a.window_slot - b.window_slot;
      if (a.window_slot != null) return -1;
      if (b.window_slot != null) return 1;
      return (b.last_activity_at?.getTime() ?? 0) - (a.last_activity_at?.getTime() ?? 0);
    });

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      chats = chats.filter(
        (c) =>
          c.name.toLowerCase().includes(lowerSearch) ||
          c.chat_id.includes(lowerSearch),
      );
    }

    const chatIds = chats.map((c) => c.chat_id);
    const activeChatIds = chats
      .filter((c) => c.window_status === WindowStatus.ACTIVE || c.window_status === WindowStatus.VALIDATED)
      .map((c) => c.chat_id);

    const [lastMsgMap, unreadMap, contactMap, validationMap] = await Promise.all([
      this.messageService.findLastMessagesBulk(chatIds),
      this.messageService.countUnreadMessagesBulk(chatIds),
      this.contactService.findByChatIds(chatIds),
      this.loadValidationStates(activeChatIds),
    ]);

    const conversations = chats.map((chat) =>
      mapConversationWithContact(
        chat,
        lastMsgMap.get(chat.chat_id) ?? null,
        unreadMap.get(chat.chat_id) ?? chat.unread_count ?? 0,
        contactMap.get(chat.chat_id),
        validationMap.get(chat.chat_id),
      ),
    );

    return { conversations, hasMore: false, nextCursor: null };
  }

  private async loadValidationStates(
    chatIds: string[],
  ): Promise<Map<string, import('src/window/services/validation-engine.service').CriterionState[]>> {
    const map = new Map<string, import('src/window/services/validation-engine.service').CriterionState[]>();
    if (chatIds.length === 0) return map;

    await Promise.all(
      chatIds.map(async (chatId) => {
        const state = await this.validationEngine.getValidationState(chatId);
        map.set(chatId, state.criteria);
      }),
    );
    return map;
  }

  /**
   * Charge les canaux dédiés d'un poste — utilisé pour filtrer les messages affichés.
   */
  getDedicatedChannelIds(posteId: string): Promise<string[]> {
    return this.channelService.getDedicatedChannelIdsForPoste(posteId);
  }

}
