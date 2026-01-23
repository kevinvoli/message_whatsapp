import { DispatcherService } from '../dispatcher/dispatcher.service';
import { QueueService } from '../dispatcher/services/queue.service';
import { WhatsappMessageService } from './whatsapp_message.service';
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
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { CreateWhatsappMessageDto } from './dto/create-whatsapp_message.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from './entities/whatsapp_message.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { FirstResponseTimeoutJob } from 'src/jorbs/first-response-timeout.job';

@WebSocketGateway(3001, {
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class WhatsappMessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly whatsappMessageService: WhatsappMessageService,
    private readonly chatService: WhatsappChatService,
    private readonly userService: WhatsappCommercialService,
    private readonly queueService: QueueService,
    private readonly dispatcherService: DispatcherService,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
    private readonly jobRunnner: FirstResponseTimeoutJob,
  ) {}

  @WebSocketServer()
  server: Server;

  // Map pour suivre les agents connectés (socketId -> commercialId)
  private connectedAgents = new Map<string, string>();

  async handleConnection(client: Socket) {
    console.log('🟢 Client connecté:', client.id);

    // Authentification via query params ou auth
    const commercialId = client.handshake.auth?.commercialId as string;
    if (commercialId) {
      this.connectedAgents.set(client.id, commercialId);
      console.log(`👨‍💻 Agent ${commercialId} connecté (socket: ${client.id})`);
      await this.queueService.addToQueue(commercialId);
      await this.dispatcherService.distributePendingMessages(commercialId);
      await this.userService.updateStatus(commercialId, true);
      await this.emitQueueUpdate();
      console.log('nuew effff status socket', true);
      this.jobRunnner.startAgentSlaMonitor(commercialId);
      await this.queueService.removeALlRankOnfline(commercialId);
    }
  }

  async handleDisconnect(client: Socket) {
    console.log('🔴 Client déconnecté:', client.id);
    const commercialId = this.connectedAgents.get(client.id);
    if (commercialId) {
      this.connectedAgents.delete(client.id);
      console.log(`👨‍💻 Agent ${commercialId} déconnecté (socket: ${client.id})`);
      await this.queueService.removeFromQueue(commercialId);
      console.log('nuew status AGent', false);
      await this.userService.updateStatus(commercialId, false);
      await this.queueService.tcheckALlRankAndAdd(commercialId);
      this.jobRunnner.stopAgentSlaMonitor(commercialId);
      await this.emitQueueUpdate();
    }
  }

  public emitConversationReassigned(
    chat: WhatsappChat,
    oldCommercialId: string ,
    newCommercialId: string,
  ) {


    // 🔴 1. Ancien commercial → suppression
    if (oldCommercialId) {
      const oldSocketId = this.getSocketIdByCommercial(oldCommercialId);
      if (oldSocketId) {
    console.log('emition des event ------------------ ', oldCommercialId);

        this.server.to(oldSocketId).emit('conversation:removed', {
          chatId: chat.chat_id,
        });
      }
    }

    // 🟢 2. Nouveau commercial → ajout
    const newSocketId = this.getSocketIdByCommercial(newCommercialId);
    if (newSocketId) {
    console.log('emition des event ------------------ ', newCommercialId);

      this.server.to(newSocketId).emit('conversation:assigned', {
        conversation: chat,
      });
    }
  }

  emitConversationReadonly(chatId: string) {
    this.server.emit('conversation:readonly', {
      chatId,
    });
  }

  public emitIncomingMessage(
    chatId: string, // ⚠️ DOIT être chat.chat_id
    commercialId: string,
    message: any,
  ) {
    const messageForFrontend = {
      id: message.id,
      text: message.text,
      timestamp: new Date(`${message.timestamp}`).getTime(),
      direction: message.direction,
      from: message.from,
      from_name: message.from_name || 'Client',
      status: message.status,
      from_me: false,
    };

    const targetSocketId = Array.from(this.connectedAgents.entries()).find(
      ([_, agentId]) => agentId === commercialId,
    )?.[0];
  }

  public async emitIncomingConversation(chat: WhatsappChat) {
    // console.log("xssssssssssssssssssssssssssssssssssssssss",chat);

    try {
      // Trouver le socket de l'agent assigné à cette conversation
      const targetSocketId = Array.from(this.connectedAgents.entries()).find(
        ([_, agentId]) => agentId === chat.commercial?.id,
      )?.[0];

      if (!targetSocketId) {
        return;
      }

      // Récupérer le dernier message
      const lastMessage =
        await this.whatsappMessageService.findLastMessageByChatId(chat.chat_id);

      // console.log("commit conversation!!!!!!!!!!!!!!!!!!",lastMessage );

      // Compter les messages non lus
      const unreadCount = await this.whatsappMessageService.countUnreadMessages(
        chat.chat_id,
      );

      // Construire l'objet conversation
      const conversation = {
        ...chat,
        // clientPhone: chat.chat_id?.split('@')[0] || '',
        last_message: lastMessage,
        unreadCount: unreadCount,
      };

      console.log('cdidvveeeeeeeeeeeeeeeeeeeeeeeee', conversation);

      // Émettre l'événement de mise à jour de conversation à l'agent spécifique
      this.server.to(targetSocketId).emit('conversation:updated', conversation);
    } catch (error) {
      console.error("Erreur lors de l'émission de la conversation:", error);
    }
  }

  emitDebug(
    server: Server,
    target: string | null,
    event: string,
    payload: any,
  ) {
    console.log('📤 SOCKET EMIT');
    console.log('Target:', target ?? 'GLOBAL');
    console.log('Event:', event);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    if (target) {
      server.to(target).emit(event, payload);
    } else {
      server.emit(event, payload);
    }
  }

  // =========================
  // EVENT: conversations:get
  // =========================
  @SubscribeMessage('conversations:get')
  async handleGetConversations(@ConnectedSocket() client: Socket) {
    const commercialId = this.connectedAgents.get(client.id);
    if (!commercialId) {
      return client.emit('error', { message: 'Not authenticated' });
    }

    try {
      const chats = await this.chatService.findByCommercialId(commercialId);
      const conversations = await Promise.all(
        chats.map(async (chat) => {
          const lastMessage =
            await this.whatsappMessageService.findLastMessageByChatId(
              chat.chat_id,
            );
          const unreadCount =
            await this.whatsappMessageService.countUnreadMessages(chat.chat_id);
          // console.log('chargement conversation:::::', lastMessage);

          return {
            ...chat,
            last_message: lastMessage,
            unread_count: unreadCount,
          };
        }),
      );

      conversations.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      );

      client.emit('conversations:list', conversations);
    } catch (error) {
      client.emit('error', {
        message: 'Failed to get conversations',
        details: error.message,
      });
    }
  }

  // =========================
  // EVENT: messages:get
  // =========================
  @SubscribeMessage('messages:get')
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chatId: string },
  ) {
    const commercialId = this.connectedAgents.get(client.id);
    if (!commercialId) {
      return client.emit('error', { message: 'Not authenticated' });
    }

    try {
      const messages = await this.whatsappMessageService.findByChatId(
        payload.chatId,
      );

      client.emit('messages:list', { chatId: payload.chatId, messages });
    } catch (error) {
      client.emit('error', {
        message: 'Failed to get messages',
        details: error.message,
      });
    }
  }
  // unreadCount
  // =========================
  // EVENT: message:send
  // =========================
  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chatId: string; text: string },
  ) {
    const commercialId = this.connectedAgents.get(client.id);
    if (!commercialId) {
      return client.emit('error', { message: 'Not authenticated' });
    }

    try {
      console.log('le chat id est ici:', payload);

      const message = await this.whatsappMessageService.createAgentMessage({
        chat_id: payload.chatId,
        text: payload.text,
        commercial_id: commercialId,
        timestamp: new Date(),
      });

      const chat = await this.chatService.findByChatId(message.chat_id);

      if (!chat) {
        return;
      }
      const lastMessage =
        await this.whatsappMessageService.findLastMessageByChatId(
          message.chat_id,
        );

      // Compter les messages non lus
      const unreadCount = await this.whatsappMessageService.countUnreadMessages(
        chat.chat_id,
      );

      // Construire l'objet conversation
      const conversation = {
        ...chat,
        last_message: lastMessage,
        unreadCount: unreadCount,
      };

      const commercialIds = chat.commercial?.id;
      if (!commercialIds) return;
      const targetSocketId = Array.from(this.connectedAgents.entries()).find(
        ([_, agentId]) => agentId === commercialIds,
      )?.[0];
      if (!targetSocketId) {
        return;
      }

      this.server.to(targetSocketId).emit('conversation:updated', conversation);

      // The dispatcher or another service should handle broadcasting this new message.
      // For now, we can emit an update to the sender.
      if (chat) {
        this.emitConversationUpdate(chat.id);
      }
    } catch (error) {
      client.emit('error', {
        message: 'Failed to send message',
        details: error.message,
      });
    }
  }

  // =========================
  // RECEVOIR UN MESSAGE (du client WhatsApp)
  // =========================
  async handleIncomingWhatsAppMessage(messageData: CreateWhatsappMessageDto) {
    console.log('📩 Message WhatsApp entrant:', {
      chat_id: messageData.chat_id,
      from: messageData.sender_phone,
      text: messageData.text,
    });

    const chat = await this.chatService.findByChatId(messageData.chat_id);
    if (!chat) throw new Error('Chat not found');
    const commercial = await this.commercialRepository.findOne({
      where: {
        id: messageData.commercial_id,
      },
    });

    if (!commercial) {
      return null;
    }
    if (!chat) throw new Error('Chat not found');

    try {
      // Sauvegarder le message en base
      const savedMessage = this.messageRepository.create({
        message_id: messageData.id ?? `agent_${Date.now()}`,
        external_id: messageData.id,
        chat: chat,
        commercial: commercial,
        direction: MessageDirection.OUT as MessageDirection,
        from_me: true,
        timestamp: new Date(messageData.timestamp).getTime(),
        status: WhatsappMessageStatus.SENT as WhatsappMessageStatus,
        source: 'agent_web',
        text: messageData.text,
        from: messageData.sender_phone,
        from_name: messageData.from_name,
      });

      console.log('💾 Message WhatsApp sauvegardé:', savedMessage.id);

      // Préparer l'objet message pour le frontend
      const messageForFrontend = {
        id: savedMessage.id,
        text: savedMessage.text,
        timestamp: new Date(savedMessage.timestamp).getTime(),
        direction: 'IN',
        from: savedMessage.from,
        from_name: savedMessage.from_name || 'Client',
        status: savedMessage.status,
        from_me: false,
      };

      // Diffuser le message à tous les agents dans la room de la conversation
      const roomName = messageData.chat_id;
      this.server.to(roomName).emit('message:received', {
        conversationId: messageData.chat_id,
        message: messageForFrontend,
      });

      console.log(`📢 Message WhatsApp diffusé dans: ${roomName}`);

      // Mettre à jour la conversation (dernier message)
      await this.updateConversationLastMessage(messageData.chat_id, {
        text: savedMessage.text ?? '(Message sans texte)',
        timestamp: savedMessage.timestamp,
        author: 'client',
      });
    } catch (error) {
      console.error('❌ Erreur lors du traitement du message WhatsApp:', error);
    }
  }

  // =========================
  // TYPING INDICATORS
  // =========================
  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; userId: string },
  ) {
    console.log('✍️ Typing started:', data);

    // Diffuser à tous les autres dans la conversation
    client.to(data.conversationId).emit('typing:start', {
      conversationId: data.conversationId,
      userId: data.userId,
      userName: 'Agent',
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    console.log('⏹️ Typing stopped:', data);

    client.to(data.conversationId).emit('typing:stop', {
      conversationId: data.conversationId,
    });
  }

  async handleTypingStartFromWebhook(chatId: string) {
    try {
      const socketId = await this._getAgentSocketId(chatId);
      if (socketId) {
        this.server
          .to(socketId)
          .emit('typing:start', { conversationId: chatId });
      }
    } catch (error) {
      console.error(`Erreur lors de l'émission du typing:start :`, error);
    }
  }

  async handleTypingStopFromWebhook(chatId: string) {
    try {
      const socketId = await this._getAgentSocketId(chatId);
      if (socketId) {
        this.server
          .to(socketId)
          .emit('typing:stop', { conversationId: chatId });
      }
    } catch (error) {
      console.error(`Erreur lors de l'émission du typing:stop :`, error);
    }
  }

  async handleMessageStatusUpdate(
    conversationId: string,
    messageId: string,
    status: string,
  ) {
    try {
      const socketId = await this._getAgentSocketId(conversationId);
      if (socketId) {
        this.server.to(socketId).emit('message:status:update', {
          conversationId,
          messageId,
          status,
        });
        console.log(
          `[Socket] Statut du message ${messageId} mis à jour à "${status}" pour la conversation ${conversationId}`,
        );
      }
    } catch (error) {
      console.error(
        `[Socket] Erreur lors de l'émission de la mise à jour du statut du message pour la conversation ${conversationId}:`,
        error,
      );
    }
  }

  private async _getAgentSocketId(chatId: string): Promise<string | undefined> {
    const chat = await this.chatService.findByChatId(chatId);
    if (!chat || !chat.commercial_id) {
      console.warn(
        `[Socket] Impossible de trouver le chat ou l'agent pour le chatId ${chatId}.`,
      );
      return undefined;
    }

    const socketEntry = Array.from(this.connectedAgents.entries()).find(
      ([_, agentId]) => agentId === chat.commercial_id,
    );

    return socketEntry ? socketEntry[0] : undefined;
  }

  // =========================
  // MÉTHODES PRIVÉES UTILITAIRES
  // =========================
  private async emitQueueUpdate(): Promise<void> {
    const queue = await this.queueService.getQueuePositions();
    this.server.emit('queue:updated', queue);
    console.log("📢 File d'attente mise à jour et diffusée.");
  }

  private async markMessagesAsRead(
    chatId: string,
    commercialId: string,
  ): Promise<void> {
    try {
      console.log(`📖 Marquer les messages comme lus pour ${chatId}`);
      // À implémenter si nécessaire
      // await this.whatsappMessageService.markAsRead(chatId, commercialId);
    } catch (error) {
      console.error('Erreur lors du marquage des messages comme lus:', error);
    }
  }

  private async updateConversationLastMessage(
    chatId: string,
    lastMessage: { text: string; timestamp: Date; author: string },
  ): Promise<void> {
    try {
      this.server.emit('conversation:updated', {
        chatId,
        lastMessage,
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du dernier message:', error);
    }
  }

  // T9Bu4TnK6QPbZLbUAAAB

  // =========================
  // PING/PONG (keep-alive)
  // =========================
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  public isAgentConnected(agentId: string): boolean {
    const connectedAgentIds = Array.from(this.connectedAgents.values());
    return connectedAgentIds.includes(agentId);
  }

  public async emitConversationUpdate(chatId: string): Promise<void> {
    try {
      const chat = await this.chatService.findByChatId(chatId);
      if (!chat || !chat.commercial_id) return;

      const targetSocketId = Array.from(this.connectedAgents.entries()).find(
        ([_, agentId]) => agentId === chat.commercial_id,
      )?.[0];

      if (targetSocketId) {
        const lastMessage =
          await this.whatsappMessageService.findLastMessageByChatId(
            chat.chat_id,
          );
        const unreadCount =
          await this.whatsappMessageService.countUnreadMessages(chat.chat_id);

        const conversationPayload = {
          ...chat,
          last_message: lastMessage,
          unread_count: unreadCount,
        };
        console.log('chat est icciccccccccccccccccccccccccc', targetSocketId);

        this.server
          .to(targetSocketId)
          .emit('conversation:updated', conversationPayload);
      }
    } catch (error) {
      console.error(
        `Failed to emit conversation update for chat ${chatId}:`,
        error,
      );
    }
  }

  private getSocketIdByCommercial(commercialId: string): string | undefined {
    return Array.from(this.connectedAgents.entries()).find(
      ([_, agentId]) => agentId === commercialId,
    )?.[0];
  }
}
