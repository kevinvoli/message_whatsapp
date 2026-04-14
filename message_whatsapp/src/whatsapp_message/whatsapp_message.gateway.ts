import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
import { ContactService } from 'src/contact/contact.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhapiOutboundError } from 'src/communication_whapi/errors/whapi-outbound.error';
import { ChannelService } from 'src/channel/channel.service';
import { SocketThrottleGuard } from './guards/socket-throttle.guard';
import { SOCKET_CLIENT_EVENTS } from 'src/realtime/events/socket-events.constants';
import { SocketAuthService } from './services/socket-auth.service';
import { SocketConversationQueryService } from './services/socket-conversation-query.service';
import { mapConversation } from 'src/realtime/mappers/socket-conversation.mapper';
import { RealtimeServerService } from 'src/realtime/realtime-server.service';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';
import { QueuePublisher } from 'src/realtime/publishers/queue.publisher';
import {
  mapMessage,
  resolveMessageText,
  resolveMediaUrl,
} from 'src/realtime/mappers/socket-message.mapper';
import { CallLogService } from 'src/call-log/call_log.service';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { NotificationService } from 'src/notification/notification.service';
import { SystemAlertService } from 'src/system-alert/system-alert.service';
import { AgentConnectionService } from 'src/realtime/connections/agent-connection.service';
import { transitionStatus } from 'src/conversations/domain/conversation-state-machine';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
})
export class WhatsappMessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WhatsappMessageGateway.name);

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
    private readonly channelService: ChannelService,
    private readonly throttle: SocketThrottleGuard,
    private readonly callLogService: CallLogService,
    private readonly notificationService: NotificationService,
    private readonly systemAlert: SystemAlertService,
    private readonly socketAuthService: SocketAuthService,
    private readonly conversationQueryService: SocketConversationQueryService,
    private readonly realtimeServerService: RealtimeServerService,
    private readonly conversationPublisher: ConversationPublisher,
    private readonly queuePublisher: QueuePublisher,
    private readonly agentConnectionService: AgentConnectionService,
  ) {}

  afterInit(server: Server): void {
    this.realtimeServerService.setServer(server);
    this.systemAlert.setSocketServer(server);
  }

  // ======================================================
  // CONNECTION / DISCONNECTION
  // ======================================================
  async handleConnection(client: Socket) {
    const ok = await this.agentConnectionService.onConnect(client);
    if (!ok) client.disconnect();
  }

  private getTenantId(client: Socket): string | null {
    return this.agentConnectionService.getAgent(client.id)?.tenantId ?? null;
  }

  private getTenantIds(client: Socket): string[] {
    return this.agentConnectionService.getAgent(client.id)?.tenantIds ?? [];
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

  async handleDisconnect(client: Socket) {
    this.throttle.removeClient(client.id);
    await this.agentConnectionService.onDisconnect(client);
  }

  // ======================================================
  // CLIENT → SERVER
  // ======================================================
  private async sendContactsToClient(client: Socket) {
    const agent = this.agentConnectionService.getAgent(client.id);
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

  @SubscribeMessage(SOCKET_CLIENT_EVENTS.CONVERSATIONS_GET)
  async handleGetConversations(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: {
      search?: string;
      cursor?: { activityAt: string; chatId: string };
    },
  ) {
    if (!this.throttle.allow(client.id, 'conversations:get')) {
      return this.emitRateLimited(client, 'conversations:get');
    }
    await this.agentConnectionService.sendConversationsToClient(client, payload?.search, payload?.cursor);
  }

  /** Charge le détail complet d'un contact (avec messages) à la demande. */
  @SubscribeMessage(SOCKET_CLIENT_EVENTS.CONTACT_GET_DETAIL)
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

  @SubscribeMessage(SOCKET_CLIENT_EVENTS.CONTACTS_GET)
  async handleGetContacts(@ConnectedSocket() client: Socket) {
    if (!this.throttle.allow(client.id, 'contacts:get')) {
      return this.emitRateLimited(client, 'contacts:get');
    }
    this.logger.debug(`Contacts list requested (${client.id})`);
    await this.sendContactsToClient(client);
  }

  /** Renvoie l'historique des appels d'un contact au client demandeur (B-05) */
  @SubscribeMessage(SOCKET_CLIENT_EVENTS.CALL_LOGS_GET)
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

  @SubscribeMessage(SOCKET_CLIENT_EVENTS.CHAT_EVENT)
  async handleChatEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { type: string; payload?: { chat_id?: string; status?: string } },
  ) {
    if (!this.throttle.allow(client.id, 'chat:event')) {
      return this.emitRateLimited(client, 'chat:event');
    }

    const agent = this.agentConnectionService.getAgent(client.id);
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

      transitionStatus(chatId, chat.status, newStatus, 'Gateway/CONVERSATION_STATUS_CHANGE');
      await this.chatService.update(chatId, { status: newStatus });
      this.logger.log(`Conversation status changed: ${chatId} → ${newStatus}`);

      const updatedChat = await this.chatService.findBychat_id(chatId);
      if (!updatedChat?.poste_id) return;

      const lastMessage =
        await this.messageService.findLastMessageBychat_id(chatId);
      // Utiliser la colonne DB unread_count (source de vérité) plutôt que
      // countUnreadMessages() qui peut retourner 0 si messages en statut READ.
      const unreadCount = updatedChat.unread_count ?? 0;

      this.server.to(`poste:${updatedChat.poste_id}`).emit('chat:event', {
        type: 'CONVERSATION_UPSERT',
        payload: mapConversation(updatedChat, lastMessage, unreadCount),
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

  @SubscribeMessage(SOCKET_CLIENT_EVENTS.MESSAGES_GET)
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chat_id: string; limit?: number; before?: string },
  ) {
    if (!this.throttle.allow(client.id, 'messages:get')) {
      return this.emitRateLimited(client, 'messages:get');
    }
    const agent = this.agentConnectionService.getAgent(client.id);
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
    const { messages, hasMore } = await this.messageService.findBychat_id(
      payload.chat_id,
      payload.limit ?? 50,
      before,
    );

    // Filtrage par canal dédié : isoler les messages selon le contexte du poste
    const dedicatedChannelIds = await this.channelService.getDedicatedChannelIdsForPoste(agent.posteId);
    const filteredMessages = messages.filter((m) => {
      if (dedicatedChannelIds.length > 0) {
        // Poste dédié : afficher uniquement les messages de ses canaux dédiés
        return dedicatedChannelIds.includes(m.dedicated_channel_id ?? '');
      }
      // Poste normal (pool) : afficher uniquement les messages hors canal dédié
      return !m.dedicated_channel_id;
    });

    client.emit('chat:event', {
      type: payload.before ? 'MESSAGE_LIST_PREPEND' : 'MESSAGE_LIST',
      payload: {
        chat_id: payload.chat_id,
        messages: filteredMessages.map(mapMessage),
        hasMore,
      },
    });
  }

  @SubscribeMessage(SOCKET_CLIENT_EVENTS.MESSAGES_READ)
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
      payload: mapConversation(chat, lastMessage, 0),
    });

    // Mettre à jour le compteur global non lus pour ce poste
    const totalUnread = await this.chatService.getTotalUnreadForPoste(chat.poste_id);
    client.emit('chat:event', {
      type: 'TOTAL_UNREAD_UPDATE',
      payload: { totalUnread },
    });
  }

  @SubscribeMessage(SOCKET_CLIENT_EVENTS.MESSAGE_SEND)
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chat_id: string; text: string; tempId: string; quotedMessageId?: string },
  ) {
    if (!this.throttle.allow(client.id, 'message:send')) {
      return this.emitRateLimited(client, 'message:send');
    }
  

    const agent = this.agentConnectionService.getAgent(client.id);
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

      // 🔒 Conversation fermée — envoi interdit
      if (chat.status === WhatsappChatStatus.FERME) {
        client.emit('chat:event', {
          type: 'MESSAGE_SEND_ERROR',
          payload: {
            chat_id: payload.chat_id,
            tempId: payload.tempId,
            code: 'CONVERSATION_CLOSED',
            message: 'Cette conversation est fermée.',
          },
        });
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
        payload: { ...mapMessage(message), tempId: payload.tempId },
      });

      const [lastMessage, freshChatAfterSend] = await Promise.all([
        this.messageService.findLastMessageBychat_id(chat.chat_id),
        this.chatService.findBychat_id(chat.chat_id),
      ]);
      // createAgentMessage a mis unread_count = 0 en DB (poste_id non null).
      // On utilise la colonne DB plutôt que countUnreadMessages() pour éviter
      // d'émettre 0 à tort si des messages entrants sont en statut READ.
      const unreadCount = freshChatAfterSend?.unread_count ?? 0;

      this.server.to(`poste:${agent.posteId}`).emit('chat:event', {
        type: 'CONVERSATION_UPSERT',
        payload: mapConversation(chat, lastMessage, unreadCount),
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
      payload: mapMessage(message),
    });
    this.logger.log(
      `INCOMING_SOCKET_EMIT trace=${message.message_id ?? message.id} chat_id=${chat.chat_id}`,
    );

    // Notification admin — nouveau message entrant
    const contactName = chat.name || chat.chat_id;
    const preview = message.text ? message.text.substring(0, 80) : '(média)';
    void this.notificationService.create('message', `Nouveau message — ${contactName}`, preview);

    // Utiliser le lastMessage fourni (message entrant = dernier message)
    // Fallback vers la DB pour les autres appelants qui ne le fournissent pas.
    // Recharger le chat depuis la DB pour obtenir le unread_count à jour
    // (le dispatcher vient de l'incrémenter via incrementUnreadCount).
    // On n'utilise PAS countUnreadMessages() : si les messages sont en statut READ
    // (webhook provider automatique), cette fonction retournerait 0 à tort.
    const [resolvedLastMessage, freshChatForUnread] = await Promise.all([
      lastMessage
        ? Promise.resolve(lastMessage)
        : this.messageService.findLastMessageBychat_id(chat.chat_id),
      this.chatService.findBychat_id(chat.chat_id),
    ]);
    const unreadCount = freshChatForUnread?.unread_count ?? chat.unread_count ?? 0;
    this.logger.debug(
      `Unread count updated (${chat.chat_id}) = ${unreadCount}`,
    );

    this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: mapConversation(chat, resolvedLastMessage, unreadCount),
    });
  }

  /**
   * Notification dédiée aux messages automatiques (from_me = true, poste_id = null).
   * Contrairement à notifyNewMessage :
   * - Ne touche PAS à chat.read_only (l'orchestrateur le gère lui-même)
   * - Ne crée PAS de notification admin "Nouveau message" (c'est un message système)
   * - Préserve le unread_count depuis la colonne DB du chat plutôt que de recalculer
   *   via countUnreadMessages() — seul le commercial en cliquant peut remettre à 0
   */
  async notifyAutoMessage(
    message: WhatsappMessage,
    chat: WhatsappChat,
  ): Promise<void> {
    if (!chat.poste_id) {
      this.logger.warn(
        `Auto message notify skipped: no assigned poste for chat ${chat.chat_id}`,
      );
      return;
    }

    this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'MESSAGE_ADD',
      payload: mapMessage(message),
    });

    // Récupérer le dernier message et le unread_count depuis la DB.
    // On utilise la colonne unread_count (gérée par le dispatcher + clic commercial)
    // et non countUnreadMessages (basé sur le status des messages, peut être 0 si
    // les messages ont été marqués comme lus par l'ouverture de la conversation).
    const [freshChat, resolvedLastMessage] = await Promise.all([
      this.chatService.findBychat_id(chat.chat_id),
      this.messageService.findLastMessageBychat_id(chat.chat_id),
    ]);

    const unreadCount = freshChat?.unread_count ?? chat.unread_count ?? 0;

    this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: mapConversation(chat, resolvedLastMessage, unreadCount),
    });

    this.logger.log(
      `AUTO_MESSAGE_NOTIFY chat_id=${chat.chat_id} unread_count=${unreadCount}`,
    );
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

  // ─── Façade publique → ConversationPublisher ─────────────────────────────

  public isAgentConnected(posteId: string): boolean {
    return this.agentConnectionService.isAgentConnected(posteId);
  }

  public emitConversationReassigned(chat: WhatsappChat, oldPosteId: string, newPosteId: string): Promise<void> {
    return this.conversationPublisher.emitConversationReassigned(chat, oldPosteId, newPosteId);
  }

  public emitBatchReassignments(reassignments: Array<{ chatId: string; oldPosteId: string; newPosteId: string }>): Promise<void> {
    return this.conversationPublisher.emitBatchReassignments(reassignments);
  }

  public emitConversationRemoved(chatId: string, posteId: string): void {
    this.conversationPublisher.emitConversationRemoved(chatId, posteId);
  }

  public emitConversationAssigned(chatId: string): Promise<void> {
    return this.conversationPublisher.emitConversationAssigned(chatId);
  }

  public emitConversationUpsertByChatId(chatId: string): Promise<void> {
    return this.conversationPublisher.emitConversationUpsertByChatId(chatId);
  }

  public emitConversationReadonly(chat: WhatsappChat): void {
    this.conversationPublisher.emitConversationReadonly(chat);
  }

  public emitConversationClosed(chat: WhatsappChat): Promise<void> {
    return this.conversationPublisher.emitConversationClosed(chat);
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

}
