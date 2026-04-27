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
import { ConversationCapacityService } from 'src/conversation-capacity/conversation-capacity.service';
import { ConversationReportService } from 'src/gicop-report/conversation-report.service';

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
    private readonly capacityService: ConversationCapacityService,
    private readonly reportService: ConversationReportService,
  ) {}

  /**
   * Charge la fenêtre de conversations d'un poste.
   * Mode glissant activé : 50 max, triées par window_slot ASC, avec états de validation.
   * Mode glissant désactivé : 50 max, triées par last_activity_at DESC, sans validation.
   */
  async loadConversationsForPoste(
    posteId: string,
    tenantIds: string[],
    searchTerm?: string,
    _cursor?: { activityAt: string; chatId: string },
  ): Promise<ConversationQueryResult> {
    const modeEnabled = await this.capacityService.isWindowModeEnabled();

    let chats: WhatsappChat[];

    if (modeEnabled) {
      // Mode fenêtre glissante — deux requêtes pour garantir que toutes les conversations
      // slottées (ACTIVE+LOCKED, y compris celles avec une activité ancienne) apparaissent.

      // 1. Toutes les conversations avec un slot assigné (max quotaTotal ≈ 50)
      //    excludeStatuses=[] : en mode fenêtre, le statut métier ne contrôle pas
      //    la visibilité — seul window_status=RELEASED exclut une conversation.
      const { chats: slotted } = await this.chatService.findByPosteId(
        posteId,
        [],
        100,
        undefined,
        WindowStatus.RELEASED,
        true,  // onlySlotted
      );

      // 2. Compléter jusqu'à 50 avec des conversations non-slottées (les plus récentes)
      const slottedIds = new Set(slotted.map((c) => c.chat_id));
      const needed = Math.max(0, 50 - slotted.length);
      let nonSlotted: WhatsappChat[] = [];
      if (needed > 0) {
        const { chats: ns } = await this.chatService.findByPosteId(
          posteId,
          [],
          needed + 5,
          undefined,
          WindowStatus.RELEASED,
        );
        nonSlotted = ns.filter((c) => !slottedIds.has(c.chat_id)).slice(0, needed);
      }

      chats = [...slotted, ...nonSlotted];
    } else {
      const result = await this.chatService.findByPosteId(
        posteId,
        ['fermé', 'converti'],
        50,
      );
      chats = result.chats;
    }

    if (tenantIds.length > 0) {
      const tenantSet = new Set(tenantIds);
      chats = chats.filter((c) => !c.tenant_id || tenantSet.has(c.tenant_id));
    }

    if (modeEnabled) {
      // Trier par window_slot ASC (conversations slottées d'abord, puis par activité)
      chats.sort((a, b) => {
        // Prioritaires toujours en tête
        if (a.is_priority && !b.is_priority) return -1;
        if (!a.is_priority && b.is_priority) return 1;
        if (a.window_slot != null && b.window_slot != null) return a.window_slot - b.window_slot;
        if (a.window_slot != null) return -1;
        if (b.window_slot != null) return 1;
        return (b.last_activity_at?.getTime() ?? 0) - (a.last_activity_at?.getTime() ?? 0);
      });

      // Fallback : si buildWindowForPoste n'a pas encore tourné (pas de window_slot),
      // appliquer le verrouillage par position en mémoire pour l'affichage immédiat.
      const { quotaActive } = await this.capacityService.getQuotas();
      chats = chats.map((chat, idx) => this.withWindowPresentation(chat, idx, quotaActive));
    } else {
      // Mode classique : tri par activité récente
      chats.sort(
        (a, b) => (b.last_activity_at?.getTime() ?? 0) - (a.last_activity_at?.getTime() ?? 0),
      );
    }

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      chats = chats.filter(
        (c) => c.name.toLowerCase().includes(lower) || c.chat_id.includes(lower),
      );
    }

    const chatIds = chats.map((c) => c.chat_id);

    // Charger les états de validation uniquement en mode glissant (conversations actives)
    const activeChatIds = modeEnabled
      ? chats
          .filter((c) => c.window_status === WindowStatus.ACTIVE)
          .map((c) => c.chat_id)
      : [];

    const [lastMsgMap, unreadMap, contactMap, validationMap, reportStatusMap] = await Promise.all([
      this.messageService.findLastMessagesBulk(chatIds),
      this.messageService.countUnreadMessagesBulk(chatIds),
      this.contactService.findByChatIds(chatIds),
      this.loadValidationStates(activeChatIds),
      this.reportService.getSubmissionStatusBulk(chatIds),
    ]);

    const conversations = chats.map((chat) =>
      mapConversationWithContact(
        chat,
        lastMsgMap.get(chat.chat_id) ?? null,
        unreadMap.get(chat.chat_id) ?? chat.unread_count ?? 0,
        contactMap.get(chat.chat_id),
        validationMap.get(chat.chat_id),
        reportStatusMap.get(chat.chat_id) ?? null,
      ),
    );

    return { conversations, hasMore: false, nextCursor: null };
  }

  private async loadValidationStates(
    chatIds: string[],
  ): Promise<Map<string, import('src/window/services/validation-engine.service').CriterionState[]>> {
    return this.validationEngine.getValidationStatesBulk(chatIds);
  }

  private withWindowPresentation(
    chat: WhatsappChat,
    index: number,
    quotaActive: number,
  ): WhatsappChat {
    const slot = chat.window_slot ?? index + 1;
    const status = chat.window_status ?? (slot <= quotaActive ? WindowStatus.ACTIVE : WindowStatus.LOCKED);
    const isLocked = status === WindowStatus.LOCKED;

    if (
      chat.window_slot === slot &&
      chat.window_status === status &&
      chat.is_locked === isLocked
    ) {
      return chat;
    }

    return Object.assign(Object.create(Object.getPrototypeOf(chat)), chat, {
      window_slot: slot,
      window_status: status,
      is_locked: isLocked,
    });
  }

  /**
   * Charge les canaux dédiés d'un poste — utilisé pour filtrer les messages affichés.
   */
  getDedicatedChannelIds(posteId: string): Promise<string[]> {
    return this.channelService.getDedicatedChannelIdsForPoste(posteId);
  }

}
