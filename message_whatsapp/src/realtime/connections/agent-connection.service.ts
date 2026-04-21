import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { QueueService } from 'src/dispatcher/services/queue.service';
import { FirstResponseTimeoutJob } from 'src/jorbs/first-response-timeout.job';
import { NotificationService } from 'src/notification/notification.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { SocketAuthService } from 'src/whatsapp_message/services/socket-auth.service';
import { SocketConversationQueryService } from 'src/whatsapp_message/services/socket-conversation-query.service';
import { QueuePublisher } from 'src/realtime/publishers/queue.publisher';
import { WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WindowRotationService } from 'src/window/services/window-rotation.service';
import { ValidationEngineService } from 'src/window/services/validation-engine.service';

export interface AgentSession {
  commercialId: string;
  posteId: string;
  tenantId: string | null;
  tenantIds: string[];
}

/**
 * TICKET-02-B — Gestion du cycle de vie des connexions agent.
 *
 * Extrait de `WhatsappMessageGateway` :
 *   - `handleConnection` → `onConnect`
 *   - `handleDisconnect` → `onDisconnect`
 *   - `connectedAgents` Map
 *   - `emitQueueUpdate` (interne)
 *   - `sendConversationsToClient` (interne + exposé pour `conversations:get`)
 *
 * Le gateway devient un coordinateur de transport ultra-léger.
 */
@Injectable()
export class AgentConnectionService {
  private readonly logger = new Logger(AgentConnectionService.name);

  /** Map socketId → session agent */
  private readonly connectedAgents = new Map<string, AgentSession>();

  constructor(
    private readonly socketAuthService: SocketAuthService,
    private readonly commercialService: WhatsappCommercialService,
    private readonly posteService: WhatsappPosteService,
    private readonly queueService: QueueService,
    private readonly jobRunner: FirstResponseTimeoutJob,
    private readonly notificationService: NotificationService,
    private readonly chatService: WhatsappChatService,
    private readonly conversationQueryService: SocketConversationQueryService,
    private readonly queuePublisher: QueuePublisher,
    private readonly windowRotation: WindowRotationService,
    private readonly validationEngine: ValidationEngineService,
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Gère la connexion d'un agent.
   * @returns true si la connexion est acceptée, false si le client doit être déconnecté.
   */
  async onConnect(client: Socket): Promise<boolean> {
    const authResult = await this.socketAuthService.authenticate(client);
    if (!authResult) return false;

    const { commercialId } = authResult;
    const commercial = await this.commercialService.findOneWithPoste(commercialId);
    if (!commercial?.poste) {
      this.logger.warn(`Socket auth refused: commercial ${commercialId} has no poste (${client.id})`);
      return false;
    }

    const posteId = commercial.poste.id;
    const tenantIds = await this.socketAuthService.resolveTenantIds(posteId);
    if (tenantIds.length === 0) {
      this.logger.warn(`Socket auth refused: tenant resolution failed (${client.id})`);
      return false;
    }

    const tenantId = tenantIds[0];
    this.connectedAgents.set(client.id, { commercialId, posteId, tenantId, tenantIds });

    for (const tid of tenantIds) {
      await client.join(`tenant:${tid}`);
    }
    await client.join(`poste:${posteId}`);
    this.logger.log(
      `Agent ${commercialId} joined ${tenantIds.length} tenant room(s): ${tenantIds.join(', ')} + poste:${posteId}`,
    );

    await this.commercialService.updateStatus(commercialId, true);
    await this.posteService.setActive(posteId, true);

    const poste = await this.posteService.findOneById(posteId);
    if (poste.is_queue_enabled) {
      await this.queueService.purgeOfflinePostes(posteId);
      await this.queueService.addPosteToQueue(posteId);
    } else {
      this.logger.warn(`Queue disabled for poste ${posteId}, skip enqueue on connect`);
    }

    await this.jobRunner.startAgentSlaMonitor(posteId);
    await this.emitQueueUpdate('agent_connected');

    // Construit ou répare la fenêtre glissante avant d'envoyer les conversations
    try {
      await this.windowRotation.buildWindowForPoste(posteId);
    } catch (err) {
      this.logger.error(
        `buildWindowForPoste failed for poste ${posteId} — conversations envoyées sans slots`,
        err instanceof Error ? err.stack : String(err),
      );
    }
    await this.sendConversationsToClient(client);
    return true;
  }

  /** Gère la déconnexion d'un agent. */
  async onDisconnect(client: Socket): Promise<void> {
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    this.connectedAgents.delete(client.id);
    await this.commercialService.updateStatus(agent.commercialId, false);

    const isPosteStillActive = Array.from(this.connectedAgents.values()).some(
      (a) => a.posteId === agent.posteId,
    );

    if (!isPosteStillActive) {
      const { chats: activeChats } = await this.chatService.findByPosteId(agent.posteId);
      const activeCount =
        activeChats.filter(
          (c) => c.status === WhatsappChatStatus.ACTIF || c.status === WhatsappChatStatus.EN_ATTENTE,
        ).length ?? 0;
      void this.notificationService.create(
        activeCount > 0 ? 'alert' : 'info',
        `Commercial déconnecté${activeCount > 0 ? ` — ${activeCount} conv. active(s)` : ''}`,
        `Le poste ${agent.posteId} s'est déconnecté${
          activeCount > 0
            ? ` avec ${activeCount} conversation(s) en cours. Réinjection automatique en attente.`
            : '.'
        }`,
      );
      await this.posteService.setActive(agent.posteId, false);
      await this.queueService.removeFromQueue(agent.posteId);
      this.jobRunner.stopAgentSlaMonitor(agent.posteId);
    }

    const queueIsEmpty = (await this.queueService.getQueuePositions()).length === 0;
    if (queueIsEmpty) {
      this.logger.log('Queue vide après déconnexion, remplissage mode offline');
      await this.queueService.fillQueueWithAllPostes();
    }

    await this.emitQueueUpdate('agent_disconnected');
  }

  // ─── Lookups ────────────────────────────────────────────────────────────────

  getAgent(socketId: string): AgentSession | undefined {
    return this.connectedAgents.get(socketId);
  }

  isAgentConnected(posteId: string): boolean {
    return Array.from(this.connectedAgents.values()).some((a) => a.posteId === posteId);
  }

  getConnectedPosteIds(): string[] {
    return Array.from(this.connectedAgents.values()).map((a) => a.posteId);
  }

  // ─── Envoi de conversations ──────────────────────────────────────────────────

  /**
   * Envoie les conversations et le total unread à un client.
   * Utilisé à la connexion ET sur `conversations:get`.
   */
  async sendConversationsToClient(
    client: Socket,
    searchTerm?: string,
    cursor?: { activityAt: string; chatId: string },
  ): Promise<void> {
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    try {
      await this.sendConversationsInternal(client, agent, searchTerm, cursor);
    } catch (err) {
      this.logger.error(
        `sendConversationsToClient failed for poste ${agent.posteId}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  // ─── Privé ───────────────────────────────────────────────────────────────────

  private async sendConversationsInternal(
    client: Socket,
    agent: Pick<AgentSession, 'posteId' | 'tenantIds'>,
    searchTerm?: string,
    cursor?: { activityAt: string; chatId: string },
  ): Promise<void> {
    const isFirstPage = !cursor;

    const { conversations, hasMore, nextCursor } =
      await this.conversationQueryService.loadConversationsForPoste(
        agent.posteId,
        agent.tenantIds,
        searchTerm,
        cursor,
      );

    const blockProgress = await this.validationEngine.getBlockProgress(agent.posteId);

    client.emit('chat:event', {
      type: 'CONVERSATION_LIST',
      payload: { conversations, hasMore: false, nextCursor: null, blockProgress },
    });

    if (isFirstPage) {
      const totalUnread = await this.chatService.getTotalUnreadForPoste(agent.posteId);
      client.emit('chat:event', {
        type: 'TOTAL_UNREAD_UPDATE',
        payload: { totalUnread },
      });

      client.emit('chat:event', {
        type: 'WINDOW_BLOCK_PROGRESS',
        payload: blockProgress,
      });
    }
  }

  private async emitQueueUpdate(reason: string): Promise<void> {
    const connectedPosteIds = this.getConnectedPosteIds();
    await this.queuePublisher.emit(reason, connectedPosteIds);
  }
}
