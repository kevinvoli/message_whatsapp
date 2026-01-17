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
      await this.emitQueueUpdate();
      console.log('nuew status socket', false);

      await this.userService.updateStatus(commercialId, false);
      // await this.dispatcherService.distributePendingMessages();
    }
  }

  public emitIncomingMessage(
    chatId: string, // ⚠️ DOIT être chat.chat_id
    commercialId: string,
    message: any,
  ) {
    const messageForFrontend = {
      id: message.id,
      text: message.text,
      timestamp: message.timestamp,
      direction: message.direction,
      from: message.from,
      from_name: message.from_name || 'Client',
      status: message.status,
      from_me: false,
    };

    const targetSocketId = Array.from(this.connectedAgents.entries()).find(
      ([_, agentId]) => agentId === commercialId,
    )?.[0];

    if (targetSocketId) {
      this.server.to(targetSocketId).emit('message:received', {
        conversationId: message.chat_id, // ✅ PAS chat.id
        message: messageForFrontend,
      });
    }
  }

public async emitIncomingConversation(chat: any) {
  try {
    // Trouver le socket de l'agent assigné à cette conversation
    const targetSocketId = Array.from(this.connectedAgents.entries()).find(
      ([_, agentId]) => agentId === chat.commercial?.id,
    )?.[0];

    if (!targetSocketId) {
   
      return;
    }

    // Récupérer le dernier message
    const lastMessage = await this.whatsappMessageService.findLastMessageByChatId(chat.chat_id);

    // Compter les messages non lus
    const unreadCount = await this.whatsappMessageService.countUnreadMessages(chat.chat_id);

    // Construire l'objet conversation
    const conversation = {
      id: chat.id,
      chat_id: chat.chat_id,
      clientName: chat.name,
      clientPhone: chat.chat_id?.split('@')[0] || '',
      lastMessage: {
        text: lastMessage?.text || 'Aucun message',
        timestamp: lastMessage?.timestamp || chat.updatedAt,
        author: lastMessage?.from_me ? 'agent' : 'client',
      },
      unreadCount: unreadCount,
      commercial_id: chat.commercial_id,
      name: chat.name,
      updatedAt: chat.updatedAt,
    };

    // Émettre l'événement de mise à jour de conversation à l'agent spécifique
    this.server.to(targetSocketId).emit('conversation:updated', conversation);

    
  } catch (error) {
    console.error('Erreur lors de l\'émission de la conversation:', error);
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
      await this.emitQueueUpdate();
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

  @SubscribeMessage('agent:logout')
  async handleAgentDisconnect(@ConnectedSocket() client: Socket) {
    const commercialId = this.connectedAgents.get(client.id);
    if (commercialId) {
      this.connectedAgents.delete(client.id);
      console.log(`👨‍💻 Agent ${commercialId} déconnecté (socket: ${client.id})`);
      await this.queueService.removeFromQueue(commercialId);
      await this.userService.updateStatus(commercialId, false);
      await this.emitQueueUpdate();
    }
  }

  // =========================
  // AUTHENTIFICATION
  // =========================
  @SubscribeMessage('auth')
  async handleAuth(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { commercialId: string; token: string },
  ) {
    console.log('🔐 Authentification:', data.commercialId);

    // Vérifier le token (à implémenter selon votre système d'auth)
    // Pour l'instant, on accepte simplement l'ID
    this.connectedAgents.set(client.id, data.commercialId);
    await this.queueService.addToQueue(data.commercialId);
    await this.emitQueueUpdate();
    // await this.dispatcherService.distributePendingMessages();

    client.emit('auth:success', { commercialId: data.commercialId });
  }

  // =========================
  // REJOINDRE UNE CONVERSATION
  // =========================
  @SubscribeMessage('join:conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; commercialId: string },
  ) {
    // console.log('📥 Agent rejoint conversation:', data);

    // Vérifier que l'agent est connecté
    const agentId = this.connectedAgents.get(client.id);
    if (!agentId) {
      client.emit('error', { error: 'Agent non authentifié' });
      return;
    }

    // Quitter toutes les autres rooms de conversation
    const rooms = Array.from(client.rooms);
    rooms.forEach((room) => {
      if (room !== client.id && room.startsWith('conversationId')) {
        client.leave(room);
      }
    });

    client.join(data.conversationId);

    // console.log(`🚪 Agent ${agentId} a rejoint la room: ${data.conversationId}`);

    // Charger les messages existants
    const messages = await this.whatsappMessageService.findByChatId(
      data.conversationId,
    );

    console
      .log
      // `💬 ${messages.length} messages chargés pour ${data.conversationId}`,
      ();

    // Envoyer les messages à l'agent
    client.emit('messages:get', {
      conversationId: data.conversationId,
      messages: messages.map((msg) => ({
        id: msg.id,
        text: msg.text || '(Pas de texte)',
        timestamp: msg.timestamp,
        from: msg.from,
        direction: msg.direction,
        from_name: msg.from_name || (msg.from_me ? 'Agent' : 'Client'),
        status: msg.status,
        from_me: msg.from_me,
      })),
    });

    client.emit('conversation:joined', {
      conversationId: data.conversationId,
      success: true,
      messageCount: messages.length,
    });

    // Marquer les messages non lus comme lus
    await this.whatsappMessageService.updateByStatus({
      id: data.conversationId,
      status: 'read',
      recipient_id: data.commercialId,
    });
  }

  // =========================
  // QUITTER UNE CONVERSATION
  // =========================
  @SubscribeMessage('leave:conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const roomName = `data.conversationId}`;
    client.leave(roomName);
    // console.log(`🚪 Agent a quitté la conversation: ${data.conversationId}`);

    client.emit('conversation:left', {
      conversationId: data.conversationId,
      success: true,
    });
  }

  // =========================
  // LISTER LES CONVERSATIONS
  // =========================
  @SubscribeMessage('get:conversation')
  async handleGetConversations(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { agentId: string },
  ) {
    console.log('mes comversation :smiley:');

    console.log('👨‍💻 Agent demande ses conversations:', data.agentId);

    try {
      // Vérifier que l'agent est connecté
      const connectedAgentId = this.connectedAgents.get(client.id);
      if (!connectedAgentId) {
        client.emit('error', { error: 'Agent non authentifié' });
        return;
      }

      console.log('le connecte id', connectedAgentId);
      // Récupérer les chats de l'agent
      const chats = await this.chatService.findByCommercialId(data.agentId);

      // console.log("le connecte id", chats);

      console
        .log
        // `📋 ${chats.length} chats trouvés pour l'agent ${data.agentId}`,
        ();

      // Pour chaque chat, récupérer le dernier message
      const conversationsWithLastMessage = await Promise.all(
        chats.map(async (chat) => {
          const lastMessage =
            await this.whatsappMessageService.findLastMessageByChatId(
              chat.chat_id,
            );
          // console.log('chat trouver ',chat );

          // Compter les messages non lus
          const unreadCount =
            await this.whatsappMessageService.countUnreadMessages(
              chat.chat_id,
              // data.agentId
            );

          return {
            id: chat.id,
            chat_id: chat.chat_id,
            clientName: chat.name,
            clientPhone: chat.chat_id?.split('@')[0] || '',
            lastMessage: {
              text: lastMessage?.text || 'Aucun message',
              timestamp: lastMessage?.timestamp || chat.updatedAt,
              author: lastMessage?.from_me ? 'agent' : 'client',
            },
            unreadCount: unreadCount,
            commercial_id: chat.commercial_id,
            name: chat.name,
            updatedAt: chat.updatedAt,
          };
        }),
      );

      // Trier par date du dernier message (plus récent en premier)
      conversationsWithLastMessage.sort(
        (a, b) =>
          new Date(b.lastMessage.timestamp).getTime() -
          new Date(a.lastMessage.timestamp).getTime(),
      );

      // Envoyer les conversations à l'agent
      client.emit('conversation:list', {
        conversations: conversationsWithLastMessage,
      });
    } catch (error) {
      console.error(
        '❌ Erreur lors de la récupération des conversations:',
        error,
      );
      client.emit('conversation:error', {
        error: 'Failed to fetch conversations',
        details: error?.message,
      });
    }
  }

  // =========================
  // CHARGER LES MESSAGES
  // =========================
  @SubscribeMessage('get:messages')
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    console.log('📩 Demande de messages pour:', data.conversationId);

    try {
      const messages = await this.whatsappMessageService.findByChatId(
        data.conversationId,
      );

      console.log(
        `💬 ${messages.length} messages trouvés pour ${data.conversationId}`,
      );

      // Formater les messages pour le frontend
      const formattedMessages = messages.map((msg) => {
        return {
          id: msg.id,
          text: msg.text || '(Message sans texte)',
          timestamp: msg.timestamp,
          direction: msg.direction,
          from: msg.from,
          from_name: msg.from_name || (msg.from_me ? 'Agent' : 'Client'),
          status: msg.status,
          from_me: msg.from_me,
          type: msg.type,
        };
      });

      client.emit('messages:get', {
        conversationId: data.conversationId,
        messages: formattedMessages,
      });
    } catch (error) {
      console.error('❌ Erreur lors du chargement des messages:', error);
      client.emit('messages:error', {
        conversationId: data.conversationId,
        error: 'Failed to load messages',
        details: error.message,
      });
    }
  }

  // =========================
  // ENVOYER UN MESSAGE (de l'agent)
  // =========================
  @SubscribeMessage('agent:message')
  async handleAgentMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      content: string;
      author: string;
      chat_id: string;
    },
  ) {
    console.log('💬 Message agent reçu:', data);

    try {
      // Vérifier que l'agent est connecté
      const agentId = this.connectedAgents.get(client.id);
      if (!agentId) {
        client.emit('error', { error: 'Agent non authentifié' });
        return;
      }

      // Créer et sauvegarder le message en base
      const savedMessage = await this.whatsappMessageService.createAgentMessage(
        {
          chat_id: data.chat_id,
          text: data.content,
          commercial_id: data.author,
          timestamp: new Date(),
        },
      );

      // console.log('💾 Message sauvegardé en base:', savedMessage.id);

      // Préparer l'objet message pour le frontend
      const messageForFrontend = {
        id: savedMessage.id,
        text: savedMessage.text,
        timestamp: savedMessage.timestamp,
        direction: 'OUT',
        from: savedMessage.from,
        from_name: savedMessage.from_name || 'Agent',
        status: savedMessage.status,
        from_me: true,
      };

      // Envoyer la confirmation à l'expéditeur
      client.emit('message:sent', {
        conversationId: data.conversationId,
        message: messageForFrontend,
      });

      console.log("✅ Confirmation envoyée à l'expéditeur");

      // Diffuser le message à tous les clients dans la room
      const roomName = data.conversationId;
      this.server.to(roomName).emit('message:received', {
        conversationId: data.conversationId,
        message: messageForFrontend,
      });

      this.server.to(roomName).emit('reception', {
        // Nous allons changer pour 'message:received'
        conversationId: data.conversationId,
        message: messageForFrontend,
      });

      console.log(`📢 Message diffusé dans la room: ${roomName}`);

      // Mettre à jour la conversation (dernier message)
      await this.updateConversationLastMessage(data.conversationId, {
        text: data.content,
        timestamp: new Date(),
        author: 'agent',
      });
    } catch (error) {
      console.error("❌ Erreur lors de l'envoi du message:", error);
      client.emit('message:error', {
        error: 'Failed to send message',
        conversationId: data.conversationId,
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
        timestamp: messageData.timestamp,
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
        timestamp: savedMessage.timestamp,
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

  async handleMessageStatusUpdate(
    conversationId: string,
    messageId: string,
    status: string,
  ) {
    const roomName = conversationId;
    this.server.to(roomName).emit('message:status:update', {
      conversationId,
      messageId,
      status,
    });
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
}
