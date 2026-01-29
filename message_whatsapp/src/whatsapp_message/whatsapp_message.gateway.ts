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
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { NotFoundException } from '@nestjs/common';

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
    // @InjectRepository(WhatsappCommercial)
    private readonly commercialService: WhatsappCommercialService,
    private readonly jobRunnner: FirstResponseTimeoutJob,
    private readonly posteService: WhatsappPosteService,
  ) {}

  @WebSocketServer()
  server: Server;

  // Map pour suivre les agents connectés (socketId -> commercialId)
  private connectedAgents = new Map<
    string,
    { commercialId: string; posteId: string }
  >();

  private getSocketIdByPoste(posteId: string): string | undefined {
    return Array.from(this.connectedAgents.entries()).find(
      ([_, agent]) => agent.posteId === posteId,
    )?.[0];
  }

  async handleConnection(client: Socket) {
    console.log('🟢 Client connecté:', client.id);

    try {
      const commercialId = client.handshake.auth?.commercialId as string;
      if (!commercialId) return;

      // 🔹 Récupérer le commercial avec son poste
      const commercial = await this.userService.findOne(commercialId);
      if (!commercial?.poste) return;
      const posteId = commercial.poste.id;

      // 🔹 Stocker l'agent connecté
      this.connectedAgents.set(client.id, { commercialId, posteId });

      // 🔹 Rejoindre la room globale du poste
      await client.join(`poste_${posteId}`);

      // 🔹 Rejoindre toutes les rooms chat associées au poste
      const chats = await this.chatService.findByPosteId(posteId);
      for (const chat of chats) {
        await client.join(`chat_${chat.chat_id}`);
      }

      // 🔹 Mettre à jour le status du commercial et du poste
      await this.userService.updateStatus(commercialId, true);
      await this.posteService.setActive(posteId, true);

      // 🔹 Ajouter le poste à la queue et synchroniser
      await this.queueService.addPosteToQueue(posteId);
      await this.queueService.syncQueueWithActivePostes();

      // 🔹 Démarrer le suivi SLA pour l'agent
      this.jobRunnner.startAgentSlaMonitor(commercialId);

      // 🔹 Émettre la mise à jour de la queue à tous les clients
      await this.emitQueueUpdate();

      console.log(
        `✅ Agent connecté et rooms rejointes pour le poste ${posteId}`,
      );
    } catch (err) {
      console.error('❌ Connexion échouée', err);
    }
  }

  async handleDisconnect(client: Socket) {
    console.log('🔴 Client déconnecté:', client.id);

    const agent = this.connectedAgents.get(client.id);
    if (!agent) {
      return client.emit('error', { message: 'Not authenticated' });
    }

    const { commercialId, posteId } = agent;

    this.connectedAgents.delete(client.id);

    await this.userService.updateStatus(commercialId, false);
    await this.posteService.setActive(posteId, false);

    await this.queueService.removeFromQueue(posteId);
    await this.queueService.checkAndInitQueue();

    this.jobRunnner.stopAgentSlaMonitor(commercialId);
    await this.emitQueueUpdate();
  }

  public emitConversationReassigned(
    chat: WhatsappChat,
    oldPosteId: string,
    newPosteId: string,
  ) {
    // 🔴 1. Ancien commercial → suppression
    if (oldPosteId) {
      const oldSocketId = this.getSocketIdByPoste(oldPosteId);
      if (oldSocketId) {
        console.log('emition des event ------------------ ', oldPosteId);

        this.server.to(oldSocketId).emit('conversation:removed', {
          chatId: chat.chat_id,
        });
      }
    }

    // 🟢 2. Nouveau commercial → ajout
    const newSocketId = this.getSocketIdByPoste(newPosteId);
    if (newSocketId) {
      console.log('emition des event ------------------ ', newPosteId);

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

  public emitIncomingMessage() {
    // chatId: string, // ⚠️ DOIT être chat.chat_id
    // posteId: string,
    // message: any,
    // const messageForFrontend = {
    //   id: message.id,
    //   text: message.text,
    //   timestamp: new Date(`${message.timestamp}`).getTime(),
    //   direction: message.direction,
    //   from: message.from,
    //   from_name: message.from_name || 'Client',
    //   status: message.status,
    //   from_me: false,
    // };
    // const targetSocketId = Array.from(this.connectedAgents.entries()).find(
    //   ([_, agentId]) => agentId === posteId,
    // )?.[0];
  }

  public async emitIncomingConversation(chat: WhatsappChat) {
    // console.log("xssssssssssssssssssssssssssssssssssssssss",chat);

    try {
      // Trouver le socket de l'agent assigné à cette conversation
      // const targetSocketId = Array.from(this.connectedAgents.entries()).find(
      //   ([_, agent]) => agent.posteId === chat.poste?.id,
      // )?.[0];

      // if (!targetSocketId) {
      //   return;
      // }

      // Récupérer le dernier message
      // const lastMessage =
      //   await this.whatsappMessageService.findLastMessageByChatId(chat.chat_id);

      // console.log("commit conversation!!!!!!!!!!!!!!!!!!",lastMessage );

      // Compter les messages non lus
      // const unreadCount = await this.whatsappMessageService.countUnreadMessages(
      //   chat.chat_id,
      // );

      // Construire l'objet conversation
      // const conversation = {
      //   ...chat,
      //   // clientPhone: chat.chat_id?.split('@')[0] || '',
      //   last_message: lastMessage,
      //   unreadCount: unreadCount,
      // };

      // console.log('cdidvveeeeeeeeeeeeeeeeeeeeeeeee', targetSocketId);
      const lastMessage =
        await this.whatsappMessageService.findLastMessageByChatId(chat.chat_id);
      const unreadCount = await this.whatsappMessageService.countUnreadMessages(
        chat.chat_id,
      );

      const conversation = {
        ...chat,
        last_message: lastMessage,
        unreadCount,
      };
      // Émettre l'événement de mise à jour de conversation à l'agent spécifique
      // this.server
      //   .to(`poste_${chat.poste_id}`)
      //   .emit('conversation:updated', conversation);

      // Diffuser à tous les commerciaux du poste
      this.server
        .to(`poste_${chat.poste?.id}`)
        .emit('conversation:updated', conversation);

      // Ajouter la room chat pour tous les sockets connectés
      const sockets = await this.server
        .in(`poste_${chat.poste?.id}`)
        .fetchSockets();
      sockets.forEach((s) => s.join(`chat_${chat.chat_id}`));
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
  console.log('📥 conversations:get', client.id);

  // 🔐 1️⃣ Lire depuis le handshake (source fiable)
  const commercialId = client.handshake.auth?.commercialId;
  if (!commercialId) {
    return client.emit('error', { message: 'Not authenticated' });
  }

  // 🔄 2️⃣ S'assurer que connectedAgents est bien rempli
  let agent = this.connectedAgents.get(client.id);

  if (!agent) {
    const commercial = await this.commercialService.findOneWithPoste(commercialId);
    if (!commercial?.poste) {
      return client.emit('error', { message: 'Aucun poste associé' });
    }

    agent = {
      commercialId,
      posteId: commercial.poste.id,
    };

    this.connectedAgents.set(client.id, agent);

    // rejoindre la room poste (important)
    await client.join(`poste_${agent.posteId}`);
  }

  const posteId = agent.posteId;

  // 🔹 3️⃣ Récupération des conversations
  const chats = await this.chatService.findByPosteId(posteId);

  const conversations = await Promise.all(
    chats.map(async (chat) => {
      const lastMessage =
        await this.whatsappMessageService.findLastMessageByChatId(chat.chat_id);

      return {
        id: chat.id,
        chat_id: chat.chat_id,
        poste_id: posteId,
        name: chat.name,
        contact_client: chat.contact_client,
        type: chat.type,
        status: chat.status,
        last_message: lastMessage ?? null,
        unread_count: chat.unread_count,
        last_activity_at: chat.last_activity_at,
        created_at: chat.createdAt,
        updated_at: chat.updatedAt,
      };
    }),
  );

  conversations.sort(
    (a, b) =>
      (b.last_activity_at?.getTime() ?? 0) -
      (a.last_activity_at?.getTime() ?? 0),
  );

  client.emit('conversations:list', conversations);
}


  // =========================
  // EVENT: messages:get
  // =========================
  @SubscribeMessage('messages:get')
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { chatId: string },
  ) {
    const agent = this.connectedAgents.get(client.id);
    if (!agent) {
      return client.emit('error', { message: 'Not authenticated' });
    }

    console.log('chat trouve2 get ======ezvbhtngb==================', client.id);
    try {
      const messages = await this.whatsappMessageService.findByChatId(
        payload.chatId,
      );

      client.emit('messages:list', {
        chatId: payload.chatId,
        messages,
      });
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
    @MessageBody()
    payload: { chatId: string; text: string; channel_id: string },
  ) {
      console.log("chat trouve3 send ========================",client.id);

    const commercialId = this.connectedAgents.get(client.id);
    console.log('id de connecte=============', commercialId);

    if (!commercialId) {
      return client.emit('error', { message: 'Not authenticated' });
    }

    try {
      // console.log('le chat id est ici:', payload);
      const chat = await this.chatService.findByChatId(payload.chatId);
      // console.log("chat trouve ========================++",chat);

      if (!chat) {
        return;
      }
      const message = await this.whatsappMessageService.createAgentMessage({
        chat_id: payload.chatId,
        text: payload.text,
        poste_id: commercialId.posteId,
        timestamp: new Date(),
        channel_id: chat?.last_msg_client_channel_id ?? payload.channel_id,
      });

      // console.log('seponse de sauvegarde', message);

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

      const posteId = chat.poste?.id;
      if (!posteId) return;
      const targetSocketId = Array.from(this.connectedAgents.entries()).find(
        ([_, agent]) => agent.posteId === posteId,
      )?.[0];
      if (!targetSocketId) {
        return;
      }

      this.server
        .to(`poste_${posteId}`)
        .emit('conversation:updated', conversation);

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
    // const commercial = await this.commercialService.findOne(
    //   messageData.commercial_id,
    // );

    // if (!commercial) {
    //   return null;
    // }
    // if (!chat) throw new Error('Chat not found');

    try {
      // Sauvegarder le message en base
      const savedMessage = this.messageRepository.create({
        message_id: messageData.id ?? `agent_${Date.now()}`,
        external_id: messageData.id,
        chat: chat,
        poste: chat.poste,
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
      // const roomName = messageData.chat_id;
      // this.server.to(roomName).emit('message:received', {
      //   conversationId: messageData.chat_id,
      //   message: messageForFrontend,
      // });

      // this.server.to(`chat_${messageData.chat_id}`).emit('message:received', {
      //   conversationId: messageData.chat_id,
      //   message: messageForFrontend,
      // });

      this.server.to(`chat_${chat.chat_id}`).emit('message:received', {
        conversationId: chat.chat_id,
        message: messageForFrontend,
      });
      // console.log(`📢 Message WhatsApp diffusé dans: ${roomName}`);

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
    if (!chat || !chat.poste_id) {
      console.warn(
        `[Socket] Impossible de trouver le chat ou l'agent pour le chatId ${chatId}.`,
      );
      return undefined;
    }

    const socketEntry = Array.from(this.connectedAgents.entries()).find(
      ([_, agent]) => agent.posteId === chat.poste_id,
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
    return connectedAgentIds.some((agent) => agent.commercialId === agentId);
  }

  public async emitConversationUpdate(chatId: string): Promise<void> {
    try {
      const chat = await this.chatService.findByChatId(chatId);
      if (!chat || !chat.poste_id) return;

      const targetSocketId = Array.from(this.connectedAgents.entries()).find(
        ([_, agent]) => agent.posteId === chat.poste?.id,
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
        console.log(
          'chat est icciccccccccccccccccccccccccc',
          conversationPayload,
        );

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

  // private getSocketIdByPoste(posteId: string): string | undefined {
  //   return Array.from(this.connectedAgents.entries()).find(
  //     ([_, agent]) => agent.posteId === posteId,
  //   )?.[0];
  // }
}
