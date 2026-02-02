import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
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

import {
  WhatsappMessage,
  WhatsappMessageStatus,
} from './entities/whatsapp_message.entity';
import { CreateWhatsappMessageDto } from './dto/create-whatsapp_message.dto';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { from } from 'rxjs';

@WebSocketGateway(3001, {
  cors: { origin: '*', credentials: true },
})
export class WhatsappMessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly messageService: WhatsappMessageService,
    private readonly chatService: WhatsappChatService,
    private readonly commercialService: WhatsappCommercialService,
    private readonly posteService: WhatsappPosteService,
    private readonly queueService: QueueService,
    private readonly dispatcherService: DispatcherService,
    private readonly jobRunner: FirstResponseTimeoutJob,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
  ) {}

  @WebSocketServer()
  server: Server;

  /** socket.id → { commercialId, posteId } */
  private connectedAgents = new Map<
    string,
    { commercialId: string; posteId: string }
  >();

  // ======================================================
  // CONNECTION / DISCONNECTION
  // ======================================================

  async handleConnection(client: Socket) {
    const commercialId = client.handshake.auth?.commercialId;
    if (!commercialId) return;
    console.log('user auth', commercialId);

    const commercial =
      await this.commercialService.findOneWithPoste(commercialId);
    if (!commercial?.poste) return;

    const posteId = commercial.poste.id;

    this.connectedAgents.set(client.id, {
      commercialId: commercial.id,
      posteId,
    });

    await client.join(`poste_${posteId}`);

    const chats = await this.chatService.findByPosteId(posteId);
    chats.forEach((c) => client.join(`chat_${c.chat_id}`));

    await this.commercialService.updateStatus(commercialId, true);
    await this.posteService.setActive(posteId, true);

    await this.queueService.addPosteToQueue(posteId);
    await this.queueService.syncQueueWithActivePostes();
    this.jobRunner.startAgentSlaMonitor(posteId);

    this.emitQueueUpdate();
  }

  async handleDisconnect(client: Socket) {
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    this.connectedAgents.delete(client.id);

    await this.commercialService.updateStatus(agent.commercialId, false);
    await this.posteService.setActive(agent.posteId, false);
    await this.queueService.removeFromQueue(agent.posteId);

    this.jobRunner.stopAgentSlaMonitor(agent.posteId);
    this.emitQueueUpdate();
  }

  // ======================================================
  // CLIENT → SERVER
  // ======================================================

  @SubscribeMessage('conversations:get')
  async handleGetConversations(@ConnectedSocket() client: Socket) {

    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    const chats = await this.chatService.findByPosteId(agent.posteId);
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

    console.log('recherche de conversation========================',conversations);

    client.emit(
      'chat:event',
      JSON.parse(
        JSON.stringify({
          type: 'CONVERSATION_LIST',
          payload: conversations,
        }),
      ),
    );
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

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { chat_id: string; text: string; channel_id: string },
  ) {
    const agent = this.connectedAgents.get(client.id);
    if (!agent) return;

    const chat = await this.chatService.findBychat_id(payload.chat_id);
    if (!chat) return;

    const message = await this.messageService.createAgentMessage({
      chat_id: payload.chat_id,
      poste_id: agent.posteId,
      text: payload.text,
      channel_id: payload.channel_id,
      timestamp: new Date(),
    });
    console.log('message add', message);

    this.server.to(`chat_${chat.chat_id}`).emit('chat:event', {
      type: 'MESSAGE_ADD',
      payload: this.mapMessage(message),
    });

    const lastMessage = await this.messageService.findLastMessageBychat_id(
      chat.chat_id,
    );
    const unreadCount = await this.messageService.countUnreadMessages(
      chat.chat_id,
    );

    this.server.to(`poste_${agent.posteId}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: this.mapConversation(chat, lastMessage, unreadCount),
    });
  }

  // ======================================================
  // WEBHOOK → SERVER
  // ======================================================

  async notifyNewMessage(message: WhatsappMessage, chat: WhatsappChat) {
    console.log('new message', message);

    // 1️⃣ Émettre le message au front du chat
    this.server.to(`chat_${chat.chat_id}`).emit('chat:event', {
      type: 'MESSAGE_ADD',
      payload: this.mapMessage(message),
    });

    // 2️⃣ Mettre à jour la conversation côté front avec le dernier message et le compteur de non lus
    const lastMessage = await this.messageService.findLastMessageBychat_id(
      chat.chat_id,
    );
    const unreadCount = await this.messageService.countUnreadMessages(
      chat.chat_id,
    );

    this.server.to(`poste_${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: this.mapConversation(chat, lastMessage, unreadCount),
    });
  }

  // ======================================================
  // MÉTHODES MANQUANTES POUR DISPATCHER / JOBS
  // ======================================================

  /** Vérifie si un agent est connecté */
  isAgentConnected(posteId: string): boolean {
    return Array.from(this.connectedAgents.values()).some(
      (a) => a.posteId === posteId,
    );
  }

  /** Notifie la réassignation d’une conversation */
  emitConversationReassigned(
    chat: WhatsappChat,
    oldPosteId: string,
    newPosteId: string,
  ) {
    this.server.to(`chat_${chat.chat_id}`).emit('chat:event', {
      type: 'CONVERSATION_REASSIGNED',
      payload: { chat_id: chat.chat_id, oldPosteId, newPosteId },
    });
  }

  /** Notifie qu’une conversation est en lecture seule */
  emitConversationReadonly(chatId: string) {
    this.server.to(`chat_${chatId}`).emit('chat:event', {
      type: 'CONVERSATION_READONLY',
      payload: { chat_id: chatId },
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

  private mapMessage = (message: WhatsappMessage) => {
    console.log('mapinge de message');

    return {
      id: message.id,
      chat_id: message.chat.chat_id,
      from_me: message.from_me,
      text: message.text ?? undefined,
      timestamp: Number(message.timestamp),
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
    };
  };

  private mapConversation(
  chat: WhatsappChat,
  lastMessage?: WhatsappMessage | null,
  unreadCount = 0,
) {
  return {
    id: chat.id,
    chat_id: chat.chat_id,
    name: chat.name,
    poste_id: chat.poste_id,
    status: chat.status,
    unreadCount,

    last_message: lastMessage
      ? {
          id: lastMessage.id,
          text: lastMessage.text ?? "",
          timestamp: Number(lastMessage.timestamp),
          from_me: lastMessage.from_me,
          status: lastMessage.status,
          type: lastMessage.type,
        }
      : null,
  };
}
}
