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
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { last } from 'rxjs';
import { ContactService } from 'src/contact/contact.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhapiOutboundError } from 'src/communication_whapi/errors/whapi-outbound.error';

type AuthPayload = {
  sub: string;
  email?: string;
  posteId?: string;
};

const wsPort =
  process.env.NODE_ENV === 'test'
    ? 0
    : Number(process.env.WS_PORT ?? 3001);

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
    { commercialId: string; posteId: string }
  >();
  private typingChats = new Set<string>(); // 💡 Track chats en typing

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
    this.connectedAgents.set(client.id, { commercialId, posteId });
    await client.join(`poste_${posteId}`);

    const chats = await this.chatService.findByPosteId(posteId);
    chats.forEach((c) => client.join(`chat_${c.chat_id}`));

    await this.commercialService.updateStatus(commercialId, true);
    await this.posteService.setActive(posteId, true);
    await this.queueService.addPosteToQueue(posteId);
    await this.queueService.syncQueueWithActivePostes();
    this.jobRunner.startAgentSlaMonitor(posteId);

    await this.emitQueueUpdate();
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
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    this.connectedAgents.delete(client.id);
    await this.commercialService.updateStatus(agent.commercialId, false);
    await this.posteService.setActive(agent.posteId, false);
    await this.queueService.removeFromQueue(agent.posteId);
    this.jobRunner.stopAgentSlaMonitor(agent.posteId);
    await this.emitQueueUpdate();
  }

  // ======================================================
  // CLIENT → SERVER
  // ======================================================
  private async sendConversationsToClient(client: Socket, searchTerm?: string) {
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    let chats = await this.chatService.findByPosteId(agent.posteId);
    if (!chats) return;

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
    const posteId = chat?.poste_id;
    if (!posteId) {
      return;
    }

    this.server.to(`poste_${posteId}`).emit('contact:event', {
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

  @SubscribeMessage('conversations:get')
  async handleGetConversations(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { search?: string },
  ) {
    await this.sendConversationsToClient(client, payload?.search);
  }

   @SubscribeMessage('contacts:get')
  async handleGetContacts(
    @ConnectedSocket() client: Socket,
    // @MessageBody() payload?: { search?: string },
  ) {
    this.logger.debug(`Contacts list requested (${client.id})`);
    await this.sendContactsToClient(client,);
  }

  @SubscribeMessage('chat:event')
  handleChatEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { type: string; payload?: { chat_id?: string } },
  ) {
    if (data.type !== 'TYPING_START' && data.type !== 'TYPING_STOP') {
      return;
    }

    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    const chatId = data.payload?.chat_id;
    if (!chatId) return;

    const commercialId = agent.commercialId;
    if (!commercialId) return;

    this.logger.debug(
      `Typing ${data.type === 'TYPING_START' ? 'start' : 'stop'} (${commercialId}) chat ${chatId}`,
    );

    client.to(`poste_${agent.posteId}`).emit('chat:event', {
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
    await this.chatService.markChatAsRead(payload.chat_id);

    const chat = await this.chatService.findBychat_id(payload.chat_id);
    if (!chat) return;

    const lastMessage = await this.messageService.findLastMessageBychat_id(
      chat.chat_id,
    );

    this.server.to(`poste_${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: this.mapConversation(chat, lastMessage, 0),
    });
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chat_id: string; text: string; tempId: string },
  ) {
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    const chat = await this.chatService.findBychat_id(payload.chat_id);
    if (!chat) return;
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
        commercial_id: agent.commercialId
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

    this.server.to(`chat_${chat.chat_id}`).emit('chat:event', {
      type: 'MESSAGE_ADD',
      payload: { ...this.mapMessage(message), tempId: payload.tempId },
    });

    const lastMessage = await this.messageService.findLastMessageBychat_id(
      chat.chat_id,
    );
    const unreadCount = await this.messageService.countUnreadMessages(
      chat.chat_id,
    );

    // const unreadCount = chat.unread_count

    this.server.to(`poste_${agent.posteId}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: this.mapConversation(chat, lastMessage, unreadCount),
    });
  }

  // ======================================================
  // WEBHOOK → SERVER
  // ======================================================
  async notifyNewMessage(message: WhatsappMessage, chat: WhatsappChat) {
    // Typing avant le message pour auto-message
    if (!message.from_me) {
      this.emitTyping(chat.chat_id, true);
      setTimeout(() => this.emitTyping(chat.chat_id, false), 2000);
    }

    this.server.to(`chat_${chat.chat_id}`).emit('chat:event', {
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
    
    this.server.to(`poste_${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: this.mapConversation(chat, lastMessage, unreadCount),
    });
  }

  // ======================================================
  // AUTO-MESSAGE avec Typing
  // ======================================================
  sendAutoMessageWithTyping(chatId: string, text: string) {
    if (this.typingChats.has(chatId)) return; // déjà en typing
    this.typingChats.add(chatId);

    this.emitTyping(chatId, true);
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
        this.emitTyping(chatId, false);
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

  private emitTyping(chatId: string, isTyping: boolean) {
    this.logger.debug(
      `Typing ${isTyping ? 'start' : 'stop'} (${chatId})`,
    );
    
    this.server.to(`chat_${chatId}`).emit('chat:event', {
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
    
    this.server.to(`poste_${newPosteId}`).emit('chat:event', {
      type: 'CONVERSATION_ASSIGNED',
      payload: this.mapConversation(chat),
    });

    this.server.to(`poste_${oldPosteId}`).emit('chat:event', {
      type: 'CONVERSATION_REMOVED',
      payload: { chat_id: chat.chat_id },
    });
  }

  public emitConversationReadonly(chat: WhatsappChat): void {
    this.server.emit('chat:event', {
      type: 'CONVERSATION_READONLY',
      payload: { chat_id: chat.chat_id, read_only: chat.read_only },
    });
  }

  // ======================================================
  // QUEUE
  // ======================================================
  private async emitQueueUpdate() {
    const queue = await this.queueService.getQueuePositions();
    this.server.emit('queue:updated', queue);
  }

  // ======================================================
  // MAPPERS
  // ======================================================
  private mapMessage = (message: WhatsappMessage) => ({
    id: message.id,
    chat_id: message.chat.chat_id,
    from_me: message.from_me,
    text: message.text ?? undefined,
    timestamp:message.timestamp,
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
        url: m.url,
        mime_type: m.mime_type,
        caption: m.caption,
        file_name: m.file_name,
        file_size: m.file_size,
        seconds: m.duration_seconds,
        latitude: m.latitude,
        longitude: m.longitude,
      })) ?? [],
  });

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
      createdAt:chat.createdAt,
      auto_message_status: chat.auto_message_status,
      last_activity_at: chat.last_activity_at,
      last_client_message_at: chat.last_client_message_at || null,
      last_poste_message_at: chat.last_poste_message_at || null,
      updatedAt: chat.updatedAt,
      poste: chat.poste || null,
      last_message: lastMessage
        ? {
            id: lastMessage.id,
            text: lastMessage.text ?? '',
            timestamp: lastMessage.timestamp,
            from_me: lastMessage.from_me,
            status: lastMessage.status,
            type: lastMessage.type,
          }
        : null,
    };
  }
}

