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
    if (!commercial?.poste) return;

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
    this.logger.log(
      `Agent ${commercialId} joined ${tenantIds.length} tenant room(s): ${tenantIds.join(', ')}`,
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
    await this.sendContactsToClient(client);
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
    const chats = await this.chatService.findByPosteId(posteId);
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
    return !!chat.tenant_id && tenantIds.includes(chat.tenant_id);
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
    await this.posteService.setActive(agent.posteId, false);
    await this.queueService.removeFromQueue(agent.posteId);
    this.jobRunner.stopAgentSlaMonitor(agent.posteId);

    // Si plus aucun agent connecte, remplir la queue avec tous les postes
    // non-bloques pour continuer a dispatcher en mode OFFLINE
    const hasActive = await this.queueService.hasActivePostes();
    if (!hasActive) {
      this.logger.log('Dernier agent deconnecte, remplissage queue offline');
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

    let chats = await this.chatService.findByPosteId(agent.posteId);
    if (!chats) return;
    if (agent.tenantIds.length > 0) {
      const tenantSet = new Set(agent.tenantIds);
      chats = chats.filter((c) => c.tenant_id && tenantSet.has(c.tenant_id));
    }

    // Calcul de filtrage côté back
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      chats = chats.filter(
        (c) =>
          c.name.toLowerCase().includes(lowerSearch) ||
          c.chat_id.includes(lowerSearch),
      );
    }

    const conversations = await Promise.all(
      chats.map(async (chat) => {
        const lastMessage = await this.messageService.findLastMessageBychat_id(
          chat.chat_id,
        );
        const unreadCount = await this.messageService.countUnreadMessages(
          chat.chat_id,
        );

        return this.mapConversation(chat, lastMessage, unreadCount);
      }),
    );

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
    const tenantId = chat?.tenant_id ?? null;

    if (!tenantId) {
      this.logger.warn(
        `Contact event skipped: missing tenant for chat ${contact.chat_id}`,
      );
      return;
    }
    this.server.to(`tenant:${tenantId}`).emit('contact:event', {
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
      if (!updatedChat?.tenant_id) return;

      const lastMessage =
        await this.messageService.findLastMessageBychat_id(chatId);
      const unreadCount = await this.messageService.countUnreadMessages(chatId);

      this.server.to(`tenant:${updatedChat.tenant_id}`).emit('chat:event', {
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

    if (!agent.tenantId) {
      return;
    }
    client.to(`tenant:${agent.tenantId}`).emit('chat:event', {
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
    @MessageBody() payload: { chat_id: string },
  ) {
    if (!this.throttle.allow(client.id, 'messages:get')) {
      return this.emitRateLimited(client, 'messages:get');
    }
    const tenantIds = this.getTenantIds(client);
    const chat = await this.chatService.findBychat_id(payload.chat_id);
    if (!chat || !this.isAllowedTenantChat(chat, tenantIds)) {
      return;
    }
    const messages = await this.messageService.findBychat_id(payload.chat_id);
    client.emit('chat:event', {
      type: 'MESSAGE_LIST',
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

    if (!chat.tenant_id) {
      this.logger.warn(
        `Conversation upsert skipped: missing tenant for chat ${chat.chat_id}`,
      );
      return;
    }
    this.server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: this.mapConversation(chat, lastMessage, 0),
    });
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chat_id: string; text: string; tempId: string },
  ) {
      console.log(
      'envoie du message pas le commercial:',
      payload,
      'client id:',
      client.id,
    );
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
        });
        this.logger.log(
          `OUTBOUND_SOCKET_ACK trace=${message.message_id ?? message.id} chat_id=${message.chat_id}`,
        );
      } catch (error) {
        const outboundCode =
          error instanceof WhapiOutboundError
            ? error.kind === 'transient'
              ? 'WHAPI_TRANSIENT_ERROR'
              : 'WHAPI_PERMANENT_ERROR'
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
        return;
      }

      sendSucceeded = true;

      if (!chat.tenant_id) {
        this.logger.warn(
          `Message emit skipped: missing tenant for chat ${chat.chat_id}`,
        );
        return;
      }
      chat.read_only = true;
      console.log("1111111111111111111111111111111111111111111111111111111111111111111111");
      
      this.server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
        type: 'MESSAGE_ADD',
        payload: { ...this.mapMessage(message), tempId: payload.tempId },
      });

      const lastMessage = await this.messageService.findLastMessageBychat_id(
        chat.chat_id,
      );
      const unreadCount = await this.messageService.countUnreadMessages(
        chat.chat_id,
      );

      if (!chat.tenant_id) {
        this.logger.warn(
          `Conversation upsert skipped: missing tenant for chat ${chat.chat_id}`,
        );
        return;
      }
      this.server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
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
  async notifyNewMessage(message: WhatsappMessage, chat: WhatsappChat) {
    // Typing avant le message pour auto-message
    if (!message.from_me) {
      void this.emitTyping(chat.chat_id, true);
      setTimeout(() => void this.emitTyping(chat.chat_id, false), 2000);
    }

    if (!chat.tenant_id) {
      this.logger.warn(
        `Inbound message skipped: missing tenant for chat ${chat.chat_id}`,
      );
      return;
    }
    chat.read_only = false;
    this.server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
      type: 'MESSAGE_ADD',
      payload: this.mapMessage(message),
    });
    this.logger.log(
      `INCOMING_SOCKET_EMIT trace=${message.message_id ?? message.id} chat_id=${chat.chat_id}`,
    );

    const lastMessage = await this.messageService.findLastMessageBychat_id(
      chat.chat_id,
    );
    const unreadCount = await this.messageService.countUnreadMessages(
      chat.chat_id,
    );
    this.logger.debug(
      `Unread count updated (${chat.chat_id}) = ${unreadCount}`,
    );

    if (!chat.tenant_id) {
      this.logger.warn(
        `Conversation upsert skipped: missing tenant for chat ${chat.chat_id}`,
      );
      return;
    }
    this.server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: this.mapConversation(chat, lastMessage, unreadCount),
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

    const tenantId = message.chat.tenant_id;
    if (!tenantId) {
      this.logger.warn(
        `STATUS_UPDATE_SKIP missing tenant for chat ${message.chat_id}`,
      );
      return;
    }

    this.server.to(`tenant:${tenantId}`).emit('chat:event', {
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
    const tenantId = chat?.tenant_id ?? null;
    if (!tenantId) {
      return;
    }
    this.server.to(`tenant:${tenantId}`).emit('chat:event', {
      type: isTyping ? 'TYPING_START' : 'TYPING_STOP',
      payload: { chat_id: chatId },
    });
  }

  public isAgentConnected(posteId: string): boolean {
    return Array.from(this.connectedAgents.values()).some(
      (a) => a.posteId === posteId,
    );
  }

  public emitConversationReassigned(
    chat: WhatsappChat,
    oldPosteId: string,
    newPosteId: string,
  ): void {
    if (!chat.tenant_id) {
      this.logger.warn(
        `Conversation reassigned skipped: missing tenant for chat ${chat.chat_id}`,
      );
      return;
    }
    this.server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
      type: 'CONVERSATION_ASSIGNED',
      payload: this.mapConversation(chat),
    });
    this.server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
      type: 'CONVERSATION_REMOVED',
      payload: { chat_id: chat.chat_id },
    });
  }

  public emitConversationReadonly(chat: WhatsappChat): void {
    if (!chat.tenant_id) {
      this.logger.warn(
        `Conversation readonly skipped: missing tenant for chat ${chat.chat_id}`,
      );
      return;
    }
    this.server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
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
    const tenants = new Set(
      Array.from(this.connectedAgents.values())
        .flatMap((agent) => agent.tenantIds)
        .filter(Boolean),
    );

    if (tenants.size === 0) {
      this.server.emit('queue:updated', {
        timestamp: new Date().toISOString(),
        reason,
        data: queue,
      });
      return;
    }

    tenants.forEach((tenantId) => {
      this.server.to(`tenant:${tenantId}`).emit('queue:updated', {
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
  });

  private resolveMediaUrl(
    message: WhatsappMessage,
    media: { provider_media_id?: string | null; media_id: string },
    directUrl: string | null,
  ): string | null {
    if (message.provider !== 'meta') {
      return directUrl ?? null;
    }
    const providerMediaId = media.provider_media_id ?? media.media_id;
    if (!providerMediaId) return null;
    const serverPort = process.env.SERVER_PORT ?? '3002';
    const rawHost =
      process.env.SERVER_PUBLIC_HOST ??
      process.env.SERVER_HOST ??
      `http://localhost:${serverPort}`;
    const serverHost = rawHost.replace(/\/+$/, '');
    const channelQuery = message.channel_id
      ? `?channelId=${encodeURIComponent(message.channel_id)}`
      : '';
    return `${serverHost}/messages/media/meta/${providerMediaId}${channelQuery}`;
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
