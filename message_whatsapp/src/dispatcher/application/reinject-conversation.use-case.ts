import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { NotificationService } from 'src/notification/notification.service';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';
import { QueueService } from '../services/queue.service';
import { DispatchPolicyService } from '../domain/dispatch-policy.service';
import { DispatchQueryService } from '../infrastructure/dispatch-query.service';
import { SlaPolicyService } from '../domain/sla-policy.service';
import { transitionStatus } from 'src/conversations/domain/conversation-state-machine';
import { AssignmentAffinityService } from '../domain/assignment-affinity.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';

/**
 * TICKET-03-C — Cas d'usage : réinjecter une conversation SLA-expirée.
 *
 * Stratégie atomique : trouver le prochain poste AVANT d'effacer l'actuel
 * (poste_id ne passe jamais par NULL pendant la réassignation).
 */
@Injectable()
export class ReinjectConversationUseCase {
  private readonly logger = new Logger(ReinjectConversationUseCase.name);

  constructor(
    private readonly queryService: DispatchQueryService,
    private readonly queueService: QueueService,
    private readonly dispatchPolicy: DispatchPolicyService,
    private readonly conversationPublisher: ConversationPublisher,
    private readonly notificationService: NotificationService,
    private readonly slaPolicy: SlaPolicyService,

    @Optional()
    private readonly affinityService: AssignmentAffinityService,
  ) {}

  /**
   * @param chat      La conversation à réinjecter
   * @param skipEmit  Si true, l'appelant batche les émissions lui-même
   * @returns Les anciens/nouveaux poste IDs, ou null si pas de changement
   */
  async execute(
    chat: WhatsappChat,
    skipEmit = false,
  ): Promise<{ oldPosteId: string; newPosteId: string } | null> {
    if (chat.read_only) {
      this.logger.warn(`Réinjection ignorée: conversation read_only (${chat.chat_id})`);
      return null;
    }

    // Extension deadline uniquement (canal dédié ou seul poste dans la queue)
    const shouldExtendOnly = await this.dispatchPolicy.shouldExtendDeadlineOnly(chat);
    if (shouldExtendOnly) {
      await this.queryService.updateChat(chat.id, {
        first_response_deadline_at: this.slaPolicy.reinjectDeadline(),
      });
      return null;
    }

    const oldPosteId = chat.poste_id ?? null;

    // S2-004/S2-005 — Sticky assignment : vérifier l'affinité avant la queue
    const nextPoste =
      (await this.resolveAffinityPosteForReinject(chat)) ??
      (await this.queueService.getNextInQueue());

    if (!nextPoste) {
      this.logger.warn(
        `Réinjection impossible (${chat.chat_id}): aucun poste alternatif — deadline étendue +30 min`,
      );
      await this.queryService.updateChat(chat.id, {
        first_response_deadline_at: this.slaPolicy.reinjectDeadline(),
      });
      return null;
    }

    const targetStatus = nextPoste.is_active
      ? WhatsappChatStatus.ACTIF
      : WhatsappChatStatus.EN_ATTENTE;
    transitionStatus(chat.chat_id, chat.status, targetStatus, 'ReinjectConversation');

    await this.queryService.updateChat(chat.id, {
      poste: nextPoste,
      poste_id: nextPoste.id,
      assigned_mode: nextPoste.is_active ? 'ONLINE' : 'OFFLINE',
      status: targetStatus,
      assigned_at: new Date(),
      first_response_deadline_at: this.slaPolicy.reinjectDeadline(),
    });

    await this.affinityService?.upsertAffinity(chat.chat_id, nextPoste.id);

    void this.notificationService.create(
      'alert',
      `SLA dépassé — ${chat.name || chat.chat_id}`,
      `La conversation de ${chat.name || chat.contact_client || chat.chat_id.split('@')[0]} a été réassignée au poste ${nextPoste.name}.`,
    );

    if (skipEmit) {
      return { oldPosteId: oldPosteId ?? '', newPosteId: nextPoste.id };
    }

    await this.conversationPublisher.emitConversationReassigned(
      { ...chat, poste_id: nextPoste.id, poste: nextPoste } as WhatsappChat,
      oldPosteId ?? '',
      nextPoste.id,
    );
    return { oldPosteId: oldPosteId ?? '', newPosteId: nextPoste.id };
  }

  // ─── Affinity resolution ─────────────────────────────────────────────────

  private async resolveAffinityPosteForReinject(chat: WhatsappChat): Promise<WhatsappPoste | null> {
    if (!this.affinityService) return null;
    const candidate = await this.affinityService.getAffinityPoste(chat.chat_id);
    if (!candidate) return null;
    // Ne pas réinjecter vers le même poste (déjà là, mais n'a pas répondu)
    if (candidate.id === chat.poste_id) return null;

    const eligible = await this.queueService.canAssignToPoste(candidate.id);
    if (eligible) {
      this.logger.log(`AFFINITY_HIT(reinject) chat_id=${chat.chat_id} poste=${candidate.name}`);
      return candidate;
    }
    this.logger.log(`AFFINITY_FALLBACK(reinject) chat_id=${chat.chat_id} poste=${candidate.name} not_eligible`);
    return null;
  }
}
