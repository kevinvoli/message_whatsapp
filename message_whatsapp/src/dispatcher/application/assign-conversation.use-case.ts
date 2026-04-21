import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { NotificationService } from 'src/notification/notification.service';
import { ChannelService } from 'src/channel/channel.service';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';
import { DispatchPolicyService } from '../domain/dispatch-policy.service';
import { DispatchQueryService } from '../infrastructure/dispatch-query.service';
import { SlaPolicyService } from '../domain/sla-policy.service';
import { transitionStatus } from 'src/conversations/domain/conversation-state-machine';
import { ContextResolverService } from 'src/context/services/context-resolver.service';
import { ContextService } from 'src/context/services/context.service';
import { ChatContext } from 'src/context/entities/chat-context.entity';
import { ConversationCapacityService } from 'src/conversation-capacity/conversation-capacity.service';

export interface AssignConversationResult {
  chat: WhatsappChat;
  chatContext: ChatContext | null;
}

/**
 * TICKET-03-C — Cas d'usage : assigner une conversation entrante à un poste.
 *
 * Responsabilité unique : décider quel poste reçoit la conversation et persister.
 * Le mutex par conversation reste dans la façade (DispatcherService) pour
 * isoler la préoccupation de concurrence de la logique métier.
 */
@Injectable()
export class AssignConversationUseCase {
  private readonly logger = new Logger(AssignConversationUseCase.name);

  constructor(
    private readonly queryService: DispatchQueryService,
    private readonly dispatchPolicy: DispatchPolicyService,
    private readonly channelService: ChannelService,
    private readonly conversationPublisher: ConversationPublisher,
    private readonly notificationService: NotificationService,
    private readonly slaPolicy: SlaPolicyService,
    private readonly contextResolver: ContextResolverService,
    private readonly contextService: ContextService,

    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,

    @Optional()
    private readonly capacityService: ConversationCapacityService,
  ) {}

  async execute(
    clientPhone: string,
    clientName: string,
    traceId?: string,
    tenantId?: string,
    channelId?: string,
  ): Promise<AssignConversationResult | null> {
    if (traceId) {
      this.logger.log(`DISPATCH_START trace=${traceId} chat_id=${clientPhone}`);
    }

    const conversation = await this.queryService.findChatByChatId(clientPhone);

    // ── Gestion read_only ────────────────────────────────────────────────────
    if (conversation?.read_only) {
      if (conversation.status === WhatsappChatStatus.FERME) {
        this.logger.log(
          `DISPATCH_REOPEN trace=${traceId ?? '-'} chat_id=${conversation.chat_id} (fermeture manuelle levée)`,
        );
        conversation.read_only = false;
        // La suite du flux va assigner le bon statut
      } else {
        this.logger.warn(`Conversation read_only ignorée (${conversation.chat_id})`);
        conversation.unread_count = (conversation.unread_count ?? 0) + 1;
        conversation.last_activity_at = new Date();
        return this.buildResult(await this.queryService.saveChat(conversation), channelId);
      }
    }

    const dedicatedPosteId = channelId
      ? await this.channelService.getDedicatedPosteId(channelId)
      : null;

    const currentPosteId = conversation?.poste?.id;
    const isAgentOnline = currentPosteId
      ? this.messageGateway.isAgentConnected(currentPosteId)
      : false;
    const eligibleForReuse = conversation
      ? this.dispatchPolicy.isEligibleForAgentReuse(conversation, dedicatedPosteId, isAgentOnline)
      : false;

    // ── Cas 1 : conversation existante + agent connecté éligible ─────────────
    if (conversation && eligibleForReuse) {
      this.logger.debug(`Conversation existante avec agent connecté (${conversation.chat_id})`);

      if (tenantId && !conversation.tenant_id) conversation.tenant_id = tenantId;
      if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
        conversation.name = clientName;
      }
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      if (!conversation.first_response_deadline_at && !conversation.last_poste_message_at) {
        conversation.first_response_deadline_at = this.slaPolicy.initialDeadline();
      }
      if (conversation.status === WhatsappChatStatus.FERME) {
        transitionStatus(conversation.chat_id, conversation.status, WhatsappChatStatus.ACTIF, 'AssignConversation/reuse');
        conversation.status = WhatsappChatStatus.ACTIF;
      }
      this.logger.log(
        `📩 Conversation (${conversation.chat_id}) assignée à ${conversation?.poste?.name ?? 'NON ASSIGNE'}`,
      );
      const saved = await this.queryService.saveChat(conversation);
      await this.conversationPublisher.emitConversationUpsertByChatId(saved.chat_id);
      return this.buildResult(saved, channelId);
    }

    // ── Résolution du prochain poste ─────────────────────────────────────────
    const { poste: nextAgent } = await this.dispatchPolicy.resolvePosteForChannel(channelId);

    // ── Cas 2 : aucun agent disponible ───────────────────────────────────────
    if (!nextAgent) {
      this.logger.warn(`⏳ Aucun agent disponible, message en attente pour ${clientPhone}`);
      const displayName = clientName || clientPhone.split('@')[0];
      void this.notificationService.create(
        'queue',
        `Conversation en attente — ${displayName}`,
        `Aucun agent disponible. La conversation de ${displayName} est placée en file d'attente.`,
      );

      if (conversation) {
        if (tenantId && !conversation.tenant_id) conversation.tenant_id = tenantId;
        if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
          conversation.name = clientName;
        }
        const from = conversation.status;
        transitionStatus(conversation.chat_id, from, WhatsappChatStatus.EN_ATTENTE, 'AssignConversation/no-agent');
        conversation.poste = null;
        conversation.poste_id = null;
        conversation.status = WhatsappChatStatus.EN_ATTENTE;
        conversation.unread_count += 1;
        conversation.last_activity_at = new Date();
        conversation.assigned_at = null;
        conversation.assigned_mode = null;
        conversation.first_response_deadline_at = null;
        conversation.last_client_message_at = new Date();
        return this.buildResult(await this.queryService.saveChat(conversation), channelId);
      }

      const waitingChat = this.queryService.createChat({
        chat_id: clientPhone,
        name: clientName,
        tenant_id: tenantId ?? null,
        type: 'private',
        contact_client: clientPhone.split('@')[0],
        poste: null,
        poste_id: null,
        status: WhatsappChatStatus.EN_ATTENTE,
        unread_count: 1,
        last_activity_at: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        assigned_at: null,
        assigned_mode: null,
        first_response_deadline_at: null,
        last_client_message_at: new Date(),
      });
      this.logger.log(`🆕 Création conversation en attente (sans agent) pour ${clientPhone}`);
      return this.buildResult(await this.queryService.saveChat(waitingChat), channelId);
    }

    // ── Cas 3 : conversation existante → réassignation ───────────────────────
    if (conversation) {
      this.logger.log(
        `🔁 Réassignation conversation (${conversation.chat_id}) → poste (${nextAgent.name})`,
      );
      if (tenantId && !conversation.tenant_id) conversation.tenant_id = tenantId;
      if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
        conversation.name = clientName;
      }
      const targetStatus = nextAgent.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE;
      const oldPosteId = conversation.poste_id ?? null;
      transitionStatus(conversation.chat_id, conversation.status, targetStatus, 'AssignConversation/reassign');
      // Vider le slot fenêtre avant de changer de poste
      conversation.window_slot = null;
      conversation.window_status = null;
      conversation.poste = nextAgent;
      conversation.poste_id = nextAgent.id;
      conversation.status = targetStatus;
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      conversation.assigned_at = new Date();
      conversation.assigned_mode = nextAgent.is_active ? 'ONLINE' : 'OFFLINE';
      conversation.first_response_deadline_at = this.slaPolicy.initialDeadline();
      conversation.last_client_message_at = new Date();
      const saved = await this.queryService.saveChat(conversation);
      if (this.capacityService) {
        // Si c'est un changement de poste, compacter l'ancien poste en arrière-plan
        if (oldPosteId && oldPosteId !== nextAgent.id) {
          this.capacityService.scheduleCompact(oldPosteId);
        }
        await this.capacityService.onConversationAssigned(saved);
      }
      void this.notificationService.create(
        'info',
        `Conversation réassignée — ${saved.name || saved.chat_id}`,
        `La conversation de ${saved.name || saved.contact_client} a été assignée au poste ${nextAgent.name}.`,
      );
      await this.conversationPublisher.emitConversationUpsertByChatId(saved.chat_id);
      return this.buildResult(saved, channelId);
    }

    // ── Cas 4 : nouvelle conversation ────────────────────────────────────────
    this.logger.log(`🆕 Création nouvelle conversation pour ${clientPhone} → poste (${nextAgent.name})`);
    const targetStatus = nextAgent.is_active
      ? WhatsappChatStatus.ACTIF
      : WhatsappChatStatus.EN_ATTENTE;
    const newChat = this.queryService.createChat({
      chat_id: clientPhone,
      name: clientName,
      tenant_id: tenantId ?? null,
      type: 'private',
      contact_client: clientPhone.split('@')[0],
      poste: nextAgent,
      poste_id: nextAgent.id,
      status: targetStatus,
      unread_count: 1,
      last_activity_at: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      assigned_at: new Date(),
      assigned_mode: nextAgent.is_active ? 'ONLINE' : 'OFFLINE',
      first_response_deadline_at: this.slaPolicy.initialDeadline(),
      last_client_message_at: new Date(),
    });
    const saved = await this.queryService.saveChat(newChat);
    if (this.capacityService) {
      await this.capacityService.onConversationAssigned(saved);
    }
    void this.notificationService.create(
      'info',
      `Nouvelle conversation — ${clientName || clientPhone.split('@')[0]}`,
      `Nouvelle conversation de ${clientName || clientPhone.split('@')[0]} assignée au poste ${nextAgent.name}.`,
    );
    await this.conversationPublisher.emitConversationAssigned(saved.chat_id);
    return this.buildResult(saved, channelId);
  }

  // ─── Context helper ───────────────────────────────────────────────────────

  /**
   * CTX-C4 — Résout le ChatContext pour la conversation sauvegardée.
   * Si aucun contexte n'est configuré, retourne chatContext: null sans erreur
   * (fallback gracieux — le pipeline continue comme avant).
   */
  private async buildResult(
    chat: WhatsappChat,
    channelId?: string,
  ): Promise<AssignConversationResult> {
    let chatContext: ChatContext | null = null;
    try {
      if (channelId) {
        const channel = await this.channelService.findByChannelId(channelId);
        const provider = channel?.provider ?? undefined;
        const context = await this.contextResolver.resolveForChannel(
          channelId,
          chat.poste_id ?? null,
          provider ?? null,
        );
        if (context) {
          chatContext = await this.contextService.findOrCreateChatContext(
            chat.chat_id,
            context.id,
            { posteId: chat.poste_id ?? null, whatsappChatId: chat.id },
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `CTX buildResult failed for chat_id=${chat.chat_id}: ${(err as Error).message}`,
      );
    }
    return { chat, chatContext };
  }
}
