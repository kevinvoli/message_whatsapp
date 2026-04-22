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
import { AssignmentAffinityService } from '../domain/assignment-affinity.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';

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

    @Optional()
    private readonly affinityService: AssignmentAffinityService,
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
        // La suite du flux routera vers le poste permanent ou assignera un nouveau poste
      } else {
        this.logger.warn(`Conversation read_only ignorée (${conversation.chat_id})`);
        conversation.unread_count = (conversation.unread_count ?? 0) + 1;
        conversation.last_activity_at = new Date();
        return this.buildResult(await this.queryService.saveChat(conversation), channelId);
      }
    }

    // ── RÈGLE PERMANENTE : si la conversation a déjà un poste → elle y reste ─
    // Un message entrant est toujours transmis au poste d'origine, qu'il soit
    // en ligne ou hors ligne. Le poste_id ne change jamais après la première attribution.
    if (conversation?.poste_id) {
      return this.routeToPermanentPoste(conversation, clientName, tenantId, channelId, traceId);
    }

    // ── Orphelin ou nouvelle conversation → chercher un poste via la queue ───
    // Seulement ici qu'on consulte la queue / le canal dédié / l'affinité.

    const dedicatedPosteId = channelId
      ? await this.channelService.getDedicatedPosteId(channelId)
      : null;

    const affinityPoste = !dedicatedPosteId
      ? await this.resolveAffinityPoste(clientPhone, traceId)
      : null;

    const { poste: nextAgent } = affinityPoste
      ? { poste: affinityPoste }
      : await this.dispatchPolicy.resolvePosteForChannel(channelId);

    // ── Aucun agent disponible ───────────────────────────────────────────────
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
        transitionStatus(conversation.chat_id, conversation.status, WhatsappChatStatus.EN_ATTENTE, 'AssignConversation/no-agent');
        conversation.status = WhatsappChatStatus.EN_ATTENTE;
        conversation.unread_count += 1;
        conversation.last_activity_at = new Date();
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

    // ── Première attribution : nouvelle conversation ou orphelin ─────────────
    this.logger.log(`🆕 Première attribution de ${clientPhone} → poste (${nextAgent.name})`);
    const targetStatus = nextAgent.is_active
      ? WhatsappChatStatus.ACTIF
      : WhatsappChatStatus.EN_ATTENTE;

    if (conversation) {
      // Orphelin qui obtient son poste pour la première fois
      if (tenantId && !conversation.tenant_id) conversation.tenant_id = tenantId;
      if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
        conversation.name = clientName;
      }
      transitionStatus(conversation.chat_id, conversation.status, targetStatus, 'AssignConversation/first-assign');
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
      if (this.capacityService) await this.capacityService.onConversationAssigned(saved);
      await this.affinityService?.upsertAffinity(saved.chat_id, nextAgent.id);
      await this.conversationPublisher.emitConversationUpsertByChatId(saved.chat_id);
      return this.buildResult(saved, channelId);
    }

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
    if (this.capacityService) await this.capacityService.onConversationAssigned(saved);
    await this.affinityService?.upsertAffinity(saved.chat_id, nextAgent.id);
    void this.notificationService.create(
      'info',
      `Nouvelle conversation — ${clientName || clientPhone.split('@')[0]}`,
      `Nouvelle conversation de ${clientName || clientPhone.split('@')[0]} assignée au poste ${nextAgent.name}.`,
    );
    await this.conversationPublisher.emitConversationAssigned(saved.chat_id);
    return this.buildResult(saved, channelId);
  }

  // ─── Routage vers le poste permanent ────────────────────────────────────────

  /**
   * Route un message entrant vers le poste déjà attribué à cette conversation.
   * Le poste ne change jamais — l'agent reçoit les messages qu'il soit en ligne ou non.
   */
  private async routeToPermanentPoste(
    conversation: WhatsappChat,
    clientName: string,
    tenantId?: string,
    channelId?: string,
    traceId?: string,
  ): Promise<AssignConversationResult> {
    const posteId = conversation.poste_id!;
    const isAgentOnline = this.messageGateway.isAgentConnected(posteId);

    if (tenantId && !conversation.tenant_id) conversation.tenant_id = tenantId;
    if (clientName && clientName !== 'Client' && clientName !== conversation.name) {
      conversation.name = clientName;
    }

    conversation.unread_count = (conversation.unread_count ?? 0) + 1;
    conversation.last_activity_at = new Date();
    conversation.last_client_message_at = new Date();

    // Réouverture depuis fermé : rétablir le statut selon la disponibilité de l'agent
    if (conversation.status === WhatsappChatStatus.FERME) {
      const newStatus = isAgentOnline ? WhatsappChatStatus.ACTIF : WhatsappChatStatus.EN_ATTENTE;
      transitionStatus(conversation.chat_id, conversation.status, newStatus, 'AssignConversation/permanent-reopen');
      conversation.status = newStatus;
      conversation.read_only = false;
      conversation.assigned_at = new Date();
      conversation.assigned_mode = isAgentOnline ? 'ONLINE' : 'OFFLINE';
    } else if (conversation.status === WhatsappChatStatus.EN_ATTENTE && isAgentOnline) {
      // Agent maintenant en ligne → activer la conversation
      transitionStatus(conversation.chat_id, conversation.status, WhatsappChatStatus.ACTIF, 'AssignConversation/permanent-activate');
      conversation.status = WhatsappChatStatus.ACTIF;
      conversation.assigned_at = new Date();
      conversation.assigned_mode = 'ONLINE';
    }

    // Maintenir une deadline SLA tant que l'agent n'a pas encore répondu
    if (!conversation.first_response_deadline_at && !conversation.last_poste_message_at) {
      conversation.first_response_deadline_at = this.slaPolicy.initialDeadline();
    }

    this.logger.log(
      `📩 PERMANENT_POSTE trace=${traceId ?? '-'} chat_id=${conversation.chat_id} poste=${posteId} online=${isAgentOnline}`,
    );

    const saved = await this.queryService.saveChat(conversation);
    await this.affinityService?.upsertAffinity(saved.chat_id, posteId);
    await this.conversationPublisher.emitConversationUpsertByChatId(saved.chat_id);
    return this.buildResult(saved, channelId);
  }

  // ─── Affinity resolution ─────────────────────────────────────────────────

  private async resolveAffinityPoste(chatId: string, traceId?: string): Promise<WhatsappPoste | null> {
    if (!this.affinityService) return null;
    const candidate = await this.affinityService.getAffinityPoste(chatId);
    if (!candidate) return null;

    const isOnline = this.messageGateway.isAgentConnected(candidate.id);
    const hasCapacity = this.capacityService
      ? await this.capacityService.hasCapacityForNewConversation(candidate.id)
      : true;

    if (isOnline && hasCapacity) {
      this.logger.log(`AFFINITY_HIT trace=${traceId ?? '-'} chat_id=${chatId} poste=${candidate.name}`);
      return candidate;
    }

    this.logger.log(
      `AFFINITY_${!isOnline ? 'WAITING' : 'FALLBACK'} trace=${traceId ?? '-'} chat_id=${chatId} poste=${candidate.name} online=${isOnline} capacity=${hasCapacity}`,
    );
    return null;
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
