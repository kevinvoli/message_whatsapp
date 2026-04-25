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

    // En mode fenêtre glissante, exclure les RELEASED dès la requête DB pour ne pas
    // les laisser occuper des slots dans le top-50 et évincer les LOCKED (grises).
    let { chats } = await this.chatService.findByPosteId(
      posteId,
      ['fermé', 'converti'],
      50,
      undefined,
      modeEnabled ? WindowStatus.RELEASED : undefined,
      modeEnabled,
    );

    if (tenantIds.length > 0) {
      const tenantSet = new Set(tenantIds);
      chats = chats.filter((c) => !c.tenant_id || tenantSet.has(c.tenant_id));
    }

    if (modeEnabled) {
      // Trier par window_slot ASC (conversations slottées d'abord, puis par activité)
      chats.sort((a, b) => {
        if (a.window_slot != null && b.window_slot != null) return a.window_slot - b.window_slot;
        if (a.window_slot != null) return -1;
        if (b.window_slot != null) return 1;
        return (b.last_activity_at?.getTime() ?? 0) - (a.last_activity_at?.getTime() ?? 0);
      });

      // Fallback : si buildWindowForPoste n'a pas encore tourné (pas de window_slot),
      // appliquer le verrouillage par position en mémoire pour l'affichage immédiat.
      const { quotaActive } = await this.capacityService.getQuotas();
      const noneSlotted = chats.every((c) => c.window_slot == null);
      if (noneSlotted && chats.length > 0) {
        chats = chats.map((chat, idx) => {
          const isLocked = idx >= quotaActive;
          return Object.assign(Object.create(Object.getPrototypeOf(chat)), chat, {
            window_slot: idx + 1,
            window_status: isLocked ? WindowStatus.LOCKED : WindowStatus.ACTIVE,
            is_locked: isLocked,
          });
        });
      }
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
          .filter((c) => c.window_status === WindowStatus.ACTIVE || c.window_status === WindowStatus.VALIDATED)
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

  /**
   * Charge les canaux dédiés d'un poste — utilisé pour filtrer les messages affichés.
   */
  getDedicatedChannelIds(posteId: string): Promise<string[]> {
    return this.channelService.getDedicatedChannelIdsForPoste(posteId);
  }

}
