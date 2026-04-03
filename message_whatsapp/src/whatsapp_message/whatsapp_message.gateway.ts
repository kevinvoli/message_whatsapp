import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { QueueService } from '../dispatcher/services/queue.service';
import { DispatcherService } from '../dispatcher/dispatcher.service';
import { FirstResponseTimeoutJob } from 'src/jorbs/first-response-timeout.job';
import { MessageAutoService } from 'src/message-auto/message-auto.service';

import { WhatsappMessage } from './entities/whatsapp_message.entity';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { last } from 'rxjs';
import { ContactService } from 'src/contact/contact.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhapiOutboundError } from 'src/communication_whapi/errors/whapi-outbound.error';
import { ChannelService } from 'src/channel/channel.service';
import { SocketThrottleGuard } from './guards/socket-throttle.guard';
import { CallLogService } from 'src/call-log/call_log.service';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { NotificationService } from 'src/notification/notification.service';

type AuthPayload = {
  sub: string;
  email?: string;
  posteId?: string;
  tenantId?: string;
};

const wsPort =
  process.env.NODE_ENV === 'test' ? 0 : Number(process.env.WS_PORT ?? 3001);

@WebSocketGateway(wsPort, {
  cors: { origin: '*', credentials: true },
})
export class WhatsappMessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WhatsappMessageGateway.name);

  private connectedAgents = new Map<
    string,
    {
      commercialId: string;
      posteId: string;
      tenantId: string | null;
      tenantIds: string[];
    }
  >();
  private typingChats = new Set<string>(); // 💡 Track chats en typing
  private pendingAgentMessages = new Map<string, NodeJS.Timeout | null>();
  private readonly pendingCooldownMs = 1500; // bloquer les contenus identiques pendant 1,5s
  private recentTempIds = new Map<string, NodeJS.Timeout>();
  private readonly tempIdRetentionMs = 10000;

  constructor(
    private readonly messageService: WhatsappMessageService,
    private readonly chatService: WhatsappChatService,
    private readonly commercialService: WhatsappCommercialService,
    private readonly posteService: WhatsappPosteService,
    private readonly queueService: QueueService,
    private readonly dispatcherService: DispatcherService,
    private readonly jobRunner: FirstResponseTimeoutJob,
    private readonly autoMessageService: MessageAutoService,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    private readonly contactService: ContactService,
    private readonly jwtService: JwtService,
    private readonly channelService: ChannelService,
    private readonly throttle: SocketThrottleGuard,
    private readonly callLogService: CallLogService,
    private readonly notificationService: NotificationService,
  ) {}

  // ======================================================
  // CONNECTION / DISCONNECTION
  // ======================================================
  async handleConnection(client: Socket) {
    const commercialId = await this.resolveCommercialId(client);
    if (!commercialId) {
      client.disconnect();
      return;
    }

    const commercial =
      await this.commercialService.findOneWithPoste(commercialId);
    if (!commercial?.poste) {
      this.logger.warn(
        `Socket auth refused: commercial ${commercialId} has no poste (${client.id})`,
      );
      client.disconnect();
      return;
    }

    const posteId = commercial.poste.id;
    const tenantIds = await this.resolveTenantIdsForPoste(posteId);
    if (tenantIds.length === 0) {
      this.logger.warn(
        `Socket auth refused: tenant resolution failed (${client.id})`,
      );
      client.disconnect();
      return;
    }

    const tenantId = tenantIds[0];
    this.connectedAgents.set(client.id, {
      commercialId,
      posteId,
      tenantId,
      tenantIds,
    });
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
      // Retirer les postes offline de la queue (remplie pendant les heures hors-service)
      // puis ajouter ce poste connecte
      await this.queueService.purgeOfflinePostes(posteId);
      await this.queueService.addPosteToQueue(posteId);
    } else {
      this.logger.warn(
        `Queue disabled for poste ${posteId}, skip enqueue on connect`,
      );
    }
    await this.jobRunner.startAgentSlaMonitor(posteId);

    await this.emitQueueUpdate('agent_connected');
    await this.sendConversationsToClient(client);
  }

  private async resolveCommercialId(client: Socket): Promise<string | null> {
    const token = this.extractAuthToken(client);
    if (!token) {
      this.logger.warn(`Socket auth refused: missing token (${client.id})`);
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthPayload>(token);
      return payload.sub ?? null;
    } catch (error) {
      this.logger.warn(`Socket auth refused: invalid token (${client.id})`);
      return null;
    }
  }

  private async resolveTenantIdsForPoste(posteId: string): Promise<string[]> {
    // On inclut toutes les conversations (même fermées) pour la résolution des tenants
    const chats = await this.chatService.findByPosteId(posteId, []);
    const tenantIds = [
      ...new Set(
        chats.map((chat) => chat.tenant_id).filter(Boolean) as string[],
      ),
    ];

    if (tenantIds.length === 0) {
      // Nouveau poste sans chats : fallback sur le premier channel disponible
      const channels = await this.channelService.findAll();
      if (channels.length > 0) {
        const channel = channels[0];
        const tenantId = await this.channelService.ensureTenantId(channel);
        this.logger.log(
          `Tenant resolved from channel for new poste ${posteId}: ${tenantId}`,
        );
        return tenantId ? [tenantId] : [];
      }
      this.logger.warn(
        `No tenant resolvable for poste ${posteId}: no chats and no channels`,
      );
      return [];
    }

    return tenantIds;
  }

  private getTenantId(client: Socket): string | null {
    return this.connectedAgents.get(client.id)?.tenantId ?? null;
  }

  private getTenantIds(client: Socket): string[] {
    return this.connectedAgents.get(client.id)?.tenantIds ?? [];
  }

  private isTenantChat(chat: WhatsappChat, tenantId: string | null): boolean {
    if (!tenantId) return true;
    return chat.tenant_id === tenantId;
  }

  private isAllowedTenantChat(
    chat: WhatsappChat,
    tenantIds: string[],
  ): boolean {
    if (tenantIds.length === 0) return true;
    // Conversations sans tenant_id (données avant multi-tenant) sont toujours autorisées
    if (!chat.tenant_id) return true;
    return tenantIds.includes(chat.tenant_id);
  }

  private extractAuthToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken;
    }

    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) return null;

    const authCookie = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('Authentication='));

    if (!authCookie) return null;
    const token = authCookie.slice('Authentication='.length);
    return token ? decodeURIComponent(token) : null;
  }

  async handleDisconnect(client: Socket) {
    this.throttle.removeClient(client.id);
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    this.connectedAgents.delete(client.id);
    await this.commercialService.updateStatus(agent.commercialId, false);

    // Verifier si un autre commercial du MEME poste est encore connecte.
    // Si oui : le poste reste actif et dans la queue — on ne touche a rien.
    // Si non : c'etait le dernier socket du poste → on le desactive et on le retire.
    const isPosteStillActive = Array.from(this.connectedAgents.values()).some(
      (a) => a.posteId === agent.posteId,
    );

    if (!isPosteStillActive) {
      const activeChats = await this.chatService.findByPosteId(agent.posteId);
      const activeCount = activeChats?.filter(
        (c) => c.status === WhatsappChatStatus.ACTIF || c.status === WhatsappChatStatus.EN_ATTENTE,
      ).length ?? 0;
      void this.notificationService.create(
        activeCount > 0 ? 'alert' : 'info',
        `Commercial déconnecté${activeCount > 0 ? ` — ${activeCount} conv. active(s)` : ''}`,
        `Le poste ${agent.posteId} s'est déconnecté${activeCount > 0 ? ` avec ${activeCount} conversation(s) en cours. Réinjection automatique en attente.` : '.'}`,
      );
      await this.posteService.setActive(agent.posteId, false);
      await this.queueService.removeFromQueue(agent.posteId);
      this.jobRunner.stopAgentSlaMonitor(agent.posteId);
    }

    // Si la queue est vide apres la deconnexion, remplir avec tous les postes
    // non-bloques ayant au moins un commercial (mode OFFLINE).
    // On verifie la queue plutot que connectedAgents.size car un commercial
    // connecte sur un poste BLOQUE occupe connectedAgents sans etre dans la queue.
    // Dans ce cas connectedAgents.size > 0 alors que la queue est bien vide.
    const queueIsEmpty =
      (await this.queueService.getQueuePositions()).length === 0;
    if (queueIsEmpty) {
      this.logger.log(
        'Queue vide apres deconnexion, remplissage mode offline',
      );
      await this.queueService.fillQueueWithAllPostes();
    }

    await this.emitQueueUpdate('agent_disconnected');
  }

  // ======================================================
  // CLIENT → SERVER
  // ======================================================
  private async sendConversationsToClient(client: Socket, searchTerm?: string) {
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    // En mode recherche : inclure toutes les conversations (fermées aussi) pour trouver l'historique.
    // En mode normal : exclure les conversations fermées/converties pour réduire la charge.
    const excludeStatuses = searchTerm ? [] : ['fermé', 'converti'];
    let chats = await this.chatService.findByPosteId(agent.posteId, excludeStatuses);
    if (!chats) return;
    if (agent.tenantIds.length > 0) {
      const tenantSet = new Set(agent.tenantIds);
      // Inclure les conversations sans tenant_id (créées avant le système multi-tenant)
      // ET celles dont le tenant est dans la liste autorisée
      chats = chats.filter((c) => !c.tenant_id || tenantSet.has(c.tenant_id));
    }

    // Filtrage textuel côté back
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      chats = chats.filter(
        (c) =>
          c.name.toLowerCase().includes(lowerSearch) ||
          c.chat_id.includes(lowerSearch),
      );
    }

    const chatIds = chats.map((c) => c.chat_id);
    const [lastMsgMap, unreadMap, contactMap, recentMsgsMap] = await Promise.all([
      this.messageService.findLastMessagesBulk(chatIds),
      this.messageService.countUnreadMessagesBulk(chatIds),
      this.contactService.findByChatIds(chatIds),
      this.messageService.findRecentByChatIds(chatIds, 50),
    ]);

    const conversations = chats.map((chat) => ({
      ...this.mapConversationWithContact(
        chat,
        lastMsgMap.get(chat.chat_id) ?? null,
        unreadMap.get(chat.chat_id) ?? 0,
        contactMap.get(chat.chat_id),
      ),
      messages: (recentMsgsMap.get(chat.chat_id) ?? []).map((row) => ({
        id: row.id,
        chat_id: row.chat_id,
        text: row.text ?? '',
        timestamp: row.timestamp ?? row.createdAt,
        from_me: Boolean(row.from_me),
        from: row.from ?? '',
        from_name: row.from_name ?? '',
        status: row.status,
        direction: row.direction,
        type: row.type,
        poste_id: row.poste_id,
        commercial_id: row.commercial_id ?? null,
        message_id: row.message_id,
        medias: [],
      })),
    }));

    client.emit('chat:event', {
      type: 'CONVERSATION_LIST',
      payload: conversations,
    });
  }

  private async sendContactsToClient(client: Socket) {
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    const contacts = await this.contactService.findAllByPosteId(agent.posteId);
    // console.log("la liste des contact ", contacts);

    client.emit('contact:event', {
      type: 'CONTACT_LIST',
      payload: contacts,
    });
  }

  private async emitContactEventForChat(
    contact: Contact,
    type: string,
    payload: unknown,
  ) {
    if (!contact.chat_id) {
      return;
    }

    const chat = await this.chatService.findBychat_id(contact.chat_id);
    const posteId = chat?.poste_id ?? null;

    if (!posteId) {
      this.logger.warn(
        `Contact event skipped: no assigned poste for chat ${contact.chat_id}`,
      );
      return;
    }
    this.server.to(`poste:${posteId}`).emit('contact:event', {
      type,
      payload,
    });
  }

  public async emitContactUpsert(contact: Contact) {
    await this.emitContactEventForChat(contact, 'CONTACT_UPSERT', contact);
  }

  public async emitContactRemoved(contact: Contact) {
    await this.emitContactEventForChat(contact, 'CONTACT_REMOVED', {
      contact_id: contact.id,
      chat_id: contact.chat_id,
    });
  }

  public async emitContactCallStatusUpdated(contact: Contact) {
    await this.emitContactEventForChat(
      contact,
      'CONTACT_CALL_STATUS_UPDATED',
      contact,
    );
  }

  /** Émet un nouveau CallLog en temps réel sur la room tenant du contact (B-05) */
  public async emitCallLogNew(contact: Contact, callLog: CallLog): Promise<void> {
    await this.emitContactEventForChat(contact, 'CALL_LOG_NEW', {
      contact_id: contact.id,
      call_log: callLog,
    });
  }

  private emitRateLimited(client: Socket, event: string): void {
    client.emit('chat:event', {
      type: 'RATE_LIMITED',
      payload: { event },
    });
  }

  @SubscribeMessage('conversations:get')
  async handleGetConversations(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { search?: string },
  ) {
    if (!this.throttle.allow(client.id, 'conversations:get')) {
      return this.emitRateLimited(client, 'conversations:get');
    }
    await this.sendConversationsToClient(client, payload?.search);
  }

  /** Charge le détail complet d'un contact (avec messages) à la demande. */
  @SubscribeMessage('contact:get_detail')
  async handleGetContactDetail(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chat_id: string },
  ) {
    if (!this.throttle.allow(client.id, 'contact:get_detail')) {
      return this.emitRateLimited(client, 'contact:get_detail');
    }
    const contact = await this.contactService.findOneByChatId(payload.chat_id);
    client.emit('contact:event', {
      type: 'CONTACT_DETAIL',
      payload: contact,
    });
  }

  @SubscribeMessage('contacts:get')
  async handleGetContacts(@ConnectedSocket() client: Socket) {
    if (!this.throttle.allow(client.id, 'contacts:get')) {
      return this.emitRateLimited(client, 'contacts:get');
    }
    this.logger.debug(`Contacts list requested (${client.id})`);
    await this.sendContactsToClient(client);
  }

  /** Renvoie l'historique des appels d'un contact au client demandeur (B-05) */
  @SubscribeMessage('call_logs:get')
  async handleGetCallLogs(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { contact_id: string },
  ) {
    if (!this.throttle.allow(client.id, 'call_logs:get')) {
      return this.emitRateLimited(client, 'call_logs:get');
    }
    const logs = await this.callLogService.findByContactId(payload.contact_id);
    client.emit('contact:event', {
      type: 'CALL_LOG_LIST',
      payload: { contact_id: payload.contact_id, call_logs: logs },
    });
  }

  @SubscribeMessage('chat:event')
  async handleChatEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { type: string; payload?: { chat_id?: string; status?: string } },
  ) {
    if (!this.throttle.allow(client.id, 'chat:event')) {
      return this.emitRateLimited(client, 'chat:event');
    }

    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    const chatId = data.payload?.chat_id;
    if (!chatId) return;

    // --- CONVERSATION_STATUS_CHANGE ---
    if (data.type === 'CONVERSATION_STATUS_CHANGE') {
      const newStatus = data.payload?.status as WhatsappChatStatus;
      if (
        !newStatus ||
        !Object.values(WhatsappChatStatus).includes(newStatus)
      ) {
        this.logger.warn(
          `Invalid conversation status: ${data.payload?.status}`,
        );
        return;
      }

      const tenantIds = this.getTenantIds(client);
      const chat = await this.chatService.findBychat_id(chatId);
      if (!chat || !this.isAllowedTenantChat(chat, tenantIds)) return;

      await this.chatService.update(chatId, { status: newStatus });
      this.logger.log(`Conversation status changed: ${chatId} → ${newStatus}`);

      const updatedChat = await this.chatService.findBychat_id(chatId);
      if (!updatedChat?.poste_id) return;

      const lastMessage =
        await this.messageService.findLastMessageBychat_id(chatId);
      const unreadCount = await this.messageService.countUnreadMessages(chatId);

      this.server.to(`poste:${updatedChat.poste_id}`).emit('chat:event', {
        type: 'CONVERSATION_UPSERT',
        payload: this.mapConversation(updatedChat, lastMessage, unreadCount),
      });
      return;
    }

    // --- TYPING ---
    if (data.type !== 'TYPING_START' && data.type !== 'TYPING_STOP') {
      return;
    }

    const commercialId = agent.commercialId;
    if (!commercialId) return;

    this.logger.debug(
      `Typing ${data.type === 'TYPING_START' ? 'start' : 'stop'} (${commercialId}) chat ${chatId}`,
    );

    client.to(`poste:${agent.posteId}`).emit('chat:event', {
      type: data.type,
      payload: {
        chat_id: chatId,
        commercial_id: commercialId,
      },
    });
  }

  @SubscribeMessage('messages:get')
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chat_id: string; limit?: number; before?: string },
  ) {
    if (!this.throttle.allow(client.id, 'messages:get')) {
      return this.emitRateLimited(client, 'messages:get');
    }
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    const tenantIds = this.getTenantIds(client);
    const chat = await this.chatService.findBychat_id(payload.chat_id);

    // Allow if chat belongs to the agent's poste (direct assignment) OR passes tenant check
    const isOwnPosteChat = !!chat && chat.poste_id === agent.posteId;
    if (!chat || (!isOwnPosteChat && !this.isAllowedTenantChat(chat, tenantIds))) {
      client.emit('chat:event', {
        type: 'MESSAGE_LIST',
        payload: { chat_id: payload.chat_id, messages: [] },
      });
      return;
    }

    const before = payload.before ? new Date(payload.before) : undefined;
    const messages = await this.messageService.findBychat_id(
      payload.chat_id,
      payload.limit ?? 50,
      before,
    );

    client.emit('chat:event', {
      type: payload.before ? 'MESSAGE_LIST_PREPEND' : 'MESSAGE_LIST',
      payload: {
        chat_id: payload.chat_id,
        messages: messages.map(this.mapMessage),
      },
    });
  }

  @SubscribeMessage('messages:read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chat_id: string },
  ) {
    if (!this.throttle.allow(client.id, 'messages:read')) {
      return this.emitRateLimited(client, 'messages:read');
    }
    const tenantIds = this.getTenantIds(client);
    await this.chatService.markChatAsRead(payload.chat_id);
    await this.messageService.markIncomingMessagesAsRead(payload.chat_id);

    const chat = await this.chatService.findBychat_id(payload.chat_id);
    if (!chat) return;
    if (!this.isAllowedTenantChat(chat, tenantIds)) return;

    const lastMessage = await this.messageService.findLastMessageBychat_id(
      chat.chat_id,
    );

    if (!chat.poste_id) {
      this.logger.warn(
        `Conversation upsert skipped: no assigned poste for chat ${chat.chat_id}`,
      );
      return;
    }
    this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: this.mapConversation(chat, lastMessage, 0),
    });
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chat_id: string; text: string; tempId: string; quotedMessageId?: string },
  ) {
    if (!this.throttle.allow(client.id, 'message:send')) {
      return this.emitRateLimited(client, 'message:send');
    }
  

    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    if (payload.tempId && this.recentTempIds.has(payload.tempId)) {
      this.logger.warn(
        `Duplicate tempId ignored (${payload.chat_id}) tempId=${payload.tempId}`,
      );
      return;
    }

    if (payload.tempId) {
      this.markTempId(payload.tempId);
    }

    const normalizedText = (payload.text ?? '').trim();
    const pendingKey = `${payload.chat_id}:${normalizedText}`;
    if (this.pendingAgentMessages.has(pendingKey)) {
      this.logger.warn(
        `Duplicate send blocked (${payload.chat_id}) text="${normalizedText}"`,
      );
      return;
    }
    this.markPendingKey(pendingKey);

    let sendSucceeded = false;

    try {
      const chat = await this.chatService.findBychat_id(payload.chat_id);
      if (!chat) {
        return;
      }
      if (!this.isAllowedTenantChat(chat, agent.tenantIds)) {
        return;
      }

      // 🔒 Fenêtre de messagerie 23h — si le client n'a pas écrit depuis plus de 23h,
      // WhatsApp n'autorise plus l'envoi de messages ordinaires.
      const WINDOW_MS = 23 * 60 * 60 * 1000;
      const lastClientAt = chat.last_client_message_at;
      if (!lastClientAt || Date.now() - new Date(lastClientAt).getTime() > WINDOW_MS) {
        client.emit('chat:event', {
          type: 'MESSAGE_SEND_ERROR',
          payload: {
            chat_id: payload.chat_id,
            tempId: payload.tempId,
            code: 'WINDOW_EXPIRED',
            message: 'Fenêtre de 23h expirée — en attente d\'un message du client.',
          },
        });
        return;
      }

      const resolvedChannelId = await this.resolveChannelIdForChat(chat);
      if (!resolvedChannelId) {
        this.logger.warn(
          `Message send refused: channel not resolved for chat ${chat.chat_id}`,
        );
        client.emit('chat:event', {
          type: 'MESSAGE_SEND_ERROR',
          payload: {
            chat_id: payload.chat_id,
            tempId: payload.tempId,
            code: 'CHANNEL_NOT_FOUND',
            message: 'Impossible de determiner le channel de la conversation',
          },
        });
        return;
      }

      let message: WhatsappMessage;
      try {
        message = await this.messageService.createAgentMessage({
          chat_id: payload.chat_id,
          poste_id: agent.posteId,
          text: payload.text,
          channel_id: resolvedChannelId,
          timestamp: new Date(),
          commercial_id: agent.commercialId,
          quotedMessageId: payload.quotedMessageId,
        });
        this.logger.log(
          `OUTBOUND_SOCKET_ACK trace=${message.message_id ?? message.id} chat_id=${message.chat_id}`,
        );
      } catch (error) {
        const isTimeoutError =
          error instanceof Error &&
          error.message.startsWith('RESPONSE_TIMEOUT_EXCEEDED');
        const outboundCode =
          error instanceof WhapiOutboundError
            ? error.kind === 'transient'
              ? 'WHAPI_TRANSIENT_ERROR'
              : 'WHAPI_PERMANENT_ERROR'
            : isTimeoutError
              ? 'RESPONSE_TIMEOUT_EXCEEDED'
              : 'MESSAGE_SEND_FAILED';
        const outboundMessage =
          error instanceof Error ? error.message : 'Echec envoi message';
        this.logger.warn(
          `Message send failed for chat ${payload.chat_id}: ${outboundCode}`,
        );
        client.emit('chat:event', {
          type: 'MESSAGE_SEND_ERROR',
          payload: {
            chat_id: payload.chat_id,
            tempId: payload.tempId,
            code: outboundCode,
            message: outboundMessage,
          },
        });
        // Notification admin — message échoué
        void this.notificationService.create('alert', `Échec envoi message (${outboundCode})`, `Chat ${payload.chat_id} — ${outboundMessage}`);
        return;
      }

      sendSucceeded = true;

      chat.read_only = true;
      this.server.to(`poste:${agent.posteId}`).emit('chat:event', {
        type: 'MESSAGE_ADD',
        payload: { ...this.mapMessage(message), tempId: payload.tempId },
      });

      const lastMessage = await this.messageService.findLastMessageBychat_id(
        chat.chat_id,
      );
      const unreadCount = await this.messageService.countUnreadMessages(
        chat.chat_id,
      );

      this.server.to(`poste:${agent.posteId}`).emit('chat:event', {
        type: 'CONVERSATION_UPSERT',
        payload: this.mapConversation(chat, lastMessage, unreadCount),
      });
    } finally {
      if (sendSucceeded) {
        this.schedulePendingRelease(pendingKey);
      } else {
        this.releasePendingKey(pendingKey);
      }
    }
  }

  // ======================================================
  // WEBHOOK → SERVER
  // ======================================================
  async notifyNewMessage(
    message: WhatsappMessage,
    chat: WhatsappChat,
    lastMessage?: WhatsappMessage,
  ) {
    // Typing avant le message pour auto-message
    if (!message.from_me) {
      void this.emitTyping(chat.chat_id, true);
      setTimeout(() => void this.emitTyping(chat.chat_id, false), 2000);
    }

    if (!chat.poste_id) {
      this.logger.warn(
        `Inbound message skipped: no assigned poste for chat ${chat.chat_id}`,
      );
      return;
    }
    chat.read_only = false;
    this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'MESSAGE_ADD',
      payload: this.mapMessage(message),
    });
    this.logger.log(
      `INCOMING_SOCKET_EMIT trace=${message.message_id ?? message.id} chat_id=${chat.chat_id}`,
    );

    // Notification admin — nouveau message entrant
    const contactName = chat.name || chat.chat_id;
    const preview = message.text ? message.text.substring(0, 80) : '(média)';
    void this.notificationService.create('message', `Nouveau message — ${contactName}`, preview);

    // Utiliser le lastMessage fourni (message entrant = dernier message)
    // Fallback vers la DB pour les autres appelants qui ne le fournissent pas
    const [resolvedLastMessage, unreadCount] = await Promise.all([
      lastMessage
        ? Promise.resolve(lastMessage)
        : this.messageService.findLastMessageBychat_id(chat.chat_id),
      this.messageService.countUnreadMessages(chat.chat_id),
    ]);
    this.logger.debug(
      `Unread count updated (${chat.chat_id}) = ${unreadCount}`,
    );

    this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: this.mapConversation(chat, resolvedLastMessage, unreadCount),
    });
  }

  // ======================================================
  // STATUS UPDATE (delivered / read / failed)
  // ======================================================

  async notifyStatusUpdate(data: {
    providerMessageId: string;
    status: string;
    errorCode?: number;
    errorTitle?: string;
  }) {
    const message = await this.messageService.findByExternalId(
      data.providerMessageId,
    );
    if (!message?.chat) {
      this.logger.warn(
        `STATUS_UPDATE_SKIP no message found for external_id=${data.providerMessageId}`,
      );
      return;
    }

    const posteId = message.chat.poste_id;
    if (!posteId) {
      this.logger.warn(
        `STATUS_UPDATE_SKIP no assigned poste for chat ${message.chat_id}`,
      );
      return;
    }

    this.server.to(`poste:${posteId}`).emit('chat:event', {
      type: 'MESSAGE_STATUS_UPDATE',
      payload: {
        message_id: message.id,
        external_id: data.providerMessageId,
        chat_id: message.chat_id,
        status: data.status,
        error_code: data.errorCode,
        error_title: data.errorTitle,
      },
    });

    this.logger.log(
      `STATUS_UPDATE_EMITTED external_id=${data.providerMessageId} status=${data.status}`,
    );
  }

  // ======================================================
  // AUTO-MESSAGE avec Typing
  // ======================================================
  sendAutoMessageWithTyping(chatId: string, text: string) {
    if (this.typingChats.has(chatId)) return; // déjà en typing
    this.typingChats.add(chatId);

    void this.emitTyping(chatId, true);
    const typingTime = Math.min(3000, text.length * 100);

    setTimeout(() => {
      void (async () => {
        const chat = await this.chatService.findBychat_id(chatId);
        if (!chat) return;
        if (!chat.poste) return;
        const resolvedChannelId = await this.resolveChannelIdForChat(chat);
        if (!resolvedChannelId) {
          this.logger.warn(
            `Auto message skipped: channel not resolved for chat ${chat.chat_id}`,
          );
          return;
        }

        const message = await this.messageService.createAgentMessage({
          chat_id: chat.chat_id,
          poste_id: chat.poste?.id,
          text,
          channel_id: resolvedChannelId,
          timestamp: new Date(),
        });

        await this.notifyNewMessage(message, chat);
      })().finally(() => {
        void this.emitTyping(chatId, false);
        this.typingChats.delete(chatId);
      });
    }, typingTime);
  }

  private async resolveChannelIdForChat(
    chat: WhatsappChat,
  ): Promise<string | null> {
    if (chat.last_msg_client_channel_id) {
      return chat.last_msg_client_channel_id;
    }

    if (chat.channel_id) {
      return chat.channel_id;
    }

    const lastMessage = await this.messageService.findLastMessageBychat_id(
      chat.chat_id,
    );
    if (lastMessage?.channel_id) {
      return lastMessage.channel_id;
    }

    return null;
  }

  private async emitTyping(chatId: string, isTyping: boolean) {
    this.logger.debug(`Typing ${isTyping ? 'start' : 'stop'} (${chatId})`);
    const chat = await this.chatService.findBychat_id(chatId);
    const posteId = chat?.poste_id ?? null;
    if (!posteId) {
      return;
    }
    this.server.to(`poste:${posteId}`).emit('chat:event', {
      type: isTyping ? 'TYPING_START' : 'TYPING_STOP',
      payload: { chat_id: chatId },
    });
  }

  public isAgentConnected(posteId: string): boolean {
    return Array.from(this.connectedAgents.values()).some(
      (a) => a.posteId === posteId,
    );
  }

  public async emitConversationReassigned(
    chat: WhatsappChat,
    oldPosteId: string,
    newPosteId: string,
  ): Promise<void> {
    this.logger.log(
      `Conversation ${chat.chat_id} reassigned ${oldPosteId} → ${newPosteId}`,
    );

    // Chaque poste a sa propre room poste:{posteId}.
    // REMOVED va uniquement à l'ancien poste, ASSIGNED uniquement au nouveau.
    this.server.to(`poste:${oldPosteId}`).emit('chat:event', {
      type: 'CONVERSATION_REMOVED',
      payload: { chat_id: chat.chat_id },
    });

    const freshChat = await this.chatService.findBychat_id(chat.chat_id);
    if (freshChat) {
      const lastMessage =
        await this.messageService.findLastMessageBychat_id(chat.chat_id);
      const unreadCount =
        await this.messageService.countUnreadMessages(chat.chat_id);

      this.server.to(`poste:${newPosteId}`).emit('chat:event', {
        type: 'CONVERSATION_ASSIGNED',
        payload: this.mapConversation(freshChat, lastMessage, unreadCount),
      });
    }

    this.logger.log(
      `CONVERSATION_REMOVED → poste:${oldPosteId} | CONVERSATION_ASSIGNED → poste:${newPosteId}`,
    );
  }

  public emitConversationRemoved(chatId: string, posteId: string): void {
    this.server.to(`poste:${posteId}`).emit('chat:event', {
      type: 'CONVERSATION_REMOVED',
      payload: { chat_id: chatId },
    });
    this.logger.log(
      `CONVERSATION_REMOVED emitted for chat ${chatId} → poste:${posteId} (no agent available)`,
    );
  }

  public async emitConversationAssigned(chatId: string): Promise<void> {
    const chat = await this.chatService.findBychat_id(chatId);
    if (!chat?.poste_id) return;
    const lastMessage = await this.messageService.findLastMessageBychat_id(chatId);
    const unreadCount = await this.messageService.countUnreadMessages(chatId);
    this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_ASSIGNED',
      payload: this.mapConversation(chat, lastMessage, unreadCount),
    });
    this.logger.log(
      `CONVERSATION_ASSIGNED emitted for new chat ${chatId} → poste:${chat.poste_id}`,
    );
  }

  public async emitConversationUpsertByChatId(
    chatId: string,
  ): Promise<void> {
    const chat = await this.chatService.findBychat_id(chatId);
    if (!chat?.poste_id) {
      this.logger.warn(
        `Conversation upsert skipped: no assigned poste for chat ${chatId}`,
      );
      return;
    }
    const lastMessage =
      await this.messageService.findLastMessageBychat_id(chatId);
    const unreadCount =
      await this.messageService.countUnreadMessages(chatId);

    this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: this.mapConversation(chat, lastMessage, unreadCount),
    });
  }

  public emitConversationReadonly(chat: WhatsappChat): void {
    if (!chat.poste_id) {
      return;
    }
    this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_READONLY',
      payload: { chat_id: chat.chat_id, read_only: chat.read_only },
    });
  }

  // ======================================================
  // QUEUE
  // ======================================================
  public async emitQueueUpdatePublic(reason: string): Promise<void> {
    await this.emitQueueUpdate(reason);
  }

  private async emitQueueUpdate(reason: string) {
    const queue = await this.queueService.getQueuePositions();
    const postes = new Set(
      Array.from(this.connectedAgents.values()).map((agent) => agent.posteId),
    );

    if (postes.size === 0) {
      this.server.emit('queue:updated', {
        timestamp: new Date().toISOString(),
        reason,
        data: queue,
      });
      return;
    }

    postes.forEach((posteId) => {
      this.server.to(`poste:${posteId}`).emit('queue:updated', {
        timestamp: new Date().toISOString(),
        reason,
        data: queue,
      });
    });
  }

  private markPendingKey(key: string) {
    this.clearPendingKeyTimeout(key);
    this.pendingAgentMessages.set(key, null);
  }

  private schedulePendingRelease(key: string) {
    this.clearPendingKeyTimeout(key);
    const timeout = setTimeout(() => {
      this.pendingAgentMessages.delete(key);
    }, this.pendingCooldownMs);
    this.pendingAgentMessages.set(key, timeout);
  }

  private releasePendingKey(key: string) {
    this.clearPendingKeyTimeout(key);
    this.pendingAgentMessages.delete(key);
  }

  private clearPendingKeyTimeout(key: string) {
    const timeout = this.pendingAgentMessages.get(key);
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  private markTempId(tempId: string) {
    this.clearTempIdTimeout(tempId);
    const timeout = setTimeout(() => {
      this.recentTempIds.delete(tempId);
    }, this.tempIdRetentionMs);
    this.recentTempIds.set(tempId, timeout);
  }

  private clearTempIdTimeout(tempId: string) {
    const timeout = this.recentTempIds.get(tempId);
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  // ======================================================
  // MAPPERS
  // ======================================================
  private mapMessage = (message: WhatsappMessage) => ({
    id: message.id,
    chat_id: message.chat.chat_id,
    from_me: message.from_me,
    text: this.resolveMessageText(message) ?? undefined,
    timestamp: message.timestamp ?? message.createdAt,
    status: message.status,
    from: message.from,
    from_name: message.from_name,
    poste_id: message.poste_id,
    direction: message.direction,
    types: message.type,
    medias:
      message.medias?.map((m) => ({
        id: m.media_id,
        type: m.media_type,
        url: this.resolveMediaUrl(message, m, m.url ?? null),
        mime_type: m.mime_type,
        caption: m.caption,
        file_name: m.file_name,
        file_size: m.file_size,
        seconds: m.duration_seconds,
        latitude: m.latitude,
        longitude: m.longitude,
      })) ?? [],
    quotedMessage: message.quotedMessage
      ? {
          id: message.quotedMessage.id,
          text: this.resolveMessageText(message.quotedMessage) ?? undefined,
          from_name: message.quotedMessage.from_name,
          from_me: message.quotedMessage.from_me,
        }
      : undefined,
  });

  private resolveMediaUrl(
    message: WhatsappMessage,
    media: { provider_media_id?: string | null; media_id: string },
    directUrl: string | null,
  ): string | null {
    const channelQuery = message.channel_id
      ? `?channelId=${encodeURIComponent(message.channel_id)}`
      : '';

    if (message.provider === 'meta') {
      const providerMediaId = media.provider_media_id ?? media.media_id;
      if (!providerMediaId) return null;
      // Chemin relatif : le frontend préfixe avec NEXT_PUBLIC_API_URL
      return `/messages/media/meta/${providerMediaId}${channelQuery}`;
    }

    if (directUrl) {
      // Si l'URL stockée est déjà relative, la retourner telle quelle
      if (directUrl.startsWith('/')) return directUrl;
      // Si c'est une ancienne URL absolue vers notre proxy, extraire le chemin
      try {
        const parsed = new URL(directUrl);
        if (parsed.pathname.startsWith('/messages/media/')) {
          return `${parsed.pathname}${parsed.search}`;
        }
      } catch {
        // URL invalide → tomber sur le return directUrl ci-dessous
      }
    }

    return directUrl ?? null;
  }

  /** Version enrichie avec les données du contact pour l'envoi initial. */
  private mapConversationWithContact(
    chat: WhatsappChat,
    lastMessage?: WhatsappMessage | null,
    unreadCount?: number,
    contact?: Contact,
  ) {
    return {
      ...this.mapConversation(chat, lastMessage, unreadCount),
      contact_client: chat.contact_client,
      contact_summary: contact
        ? {
            id: contact.id,
            call_status: contact.call_status,
            call_count: contact.call_count ?? 0,
            priority: contact.priority ?? null,
            source: contact.source ?? null,
            tags: [],
            conversion_status: contact.conversion_status ?? null,
            last_call_date: contact.last_call_date ?? null,
            is_active: contact.is_active,
          }
        : null,
    };
  }

  private mapConversation(
    chat: WhatsappChat,
    lastMessage?: WhatsappMessage | null,
    unreadCount?: number,
  ) {
    return {
      id: chat.id,
      chat_id: chat.chat_id,
      channel_id: chat.channel_id,
      last_msg_client_channel_id: chat.last_msg_client_channel_id,
      name: chat.name,
      poste_id: chat.poste_id,
      status: chat.status,
      unreadCount: unreadCount ?? chat.unread_count ?? 0,
      createdAt: chat.createdAt,
      auto_message_status: chat.auto_message_status,
      last_activity_at: chat.last_activity_at,
      last_client_message_at: chat.last_client_message_at || null,
      last_poste_message_at: chat.last_poste_message_at || null,
      updatedAt: chat.updatedAt,
      poste: chat.poste || null,
      last_message: lastMessage
        ? {
            id: lastMessage.id,
            text: this.resolveMessageText(lastMessage) ?? '',
            timestamp: lastMessage.timestamp ?? lastMessage.createdAt,
            from_me: lastMessage.from_me,
            status: lastMessage.status,
            type: lastMessage.type,
          }
        : null,
      read_only: chat.read_only,
      contact_client: chat.contact_client,
      first_response_deadline_at: chat.first_response_deadline_at,
    };
  }

  private resolveMessageText(message: WhatsappMessage): string | null {
    const rawText = typeof message.text === 'string' ? message.text.trim() : '';
    if (rawText) return message.text ?? rawText;

    const media = message.medias?.[0];
    const type = message.type ?? media?.media_type ?? null;

    if (media?.caption && media.caption.trim().length > 0) {
      return media.caption;
    }

    switch (type) {
      case 'image':
        return '[Photo]';
      case 'video':
      case 'gif':
      case 'short':
        return '[Video]';
      case 'audio':
      case 'voice':
        return '[Message vocal]';
      case 'document':
        return media?.file_name ?? '[Document]';
      case 'location':
      case 'live_location':
        return '[Localisation]';
      case 'interactive':
      case 'buttons':
      case 'button':
      case 'list':
        return '[Message interactif]';
      default:
        return media ? '[Media]' : null;
    }
  }
}
