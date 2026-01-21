import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { DispatcherOrchestrator } from '../dispatcher/services/dispatcher-orchestrator.service';
import { WhatsappMessage } from './entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';

@WebSocketGateway(3001, {
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class WhatsappMessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WhatsappMessageGateway.name);
  @WebSocketServer()
  server: Server;

  // Map to track connected agents (socket.id -> commercialId)
  private connectedAgents = new Map<string, string>();

  constructor(
    private readonly dispatcherOrchestrator: DispatcherOrchestrator,
    private readonly messageService: WhatsappMessageService,
    private readonly chatService: WhatsappChatService,
    ) {}

  /**
   * ---------------------------------------------------------------------------------
   * 🔌 GESTION DES CONNEXIONS SOCKET
   * ---------------------------------------------------------------------------------
   */

  async handleConnection(client: Socket) {
    const commercialId = client.handshake.auth?.commercialId as string;
    if (!commercialId) {
      this.logger.warn(`Client ${client.id} a tenté de se connecter sans commercialId.`);
      client.disconnect();
      return;
    }

    this.connectedAgents.set(client.id, commercialId);
    this.logger.log(`🟢 Agent ${commercialId} connecté avec socket ${client.id}`);
    await this.dispatcherOrchestrator.handleUserConnected(commercialId);
  }

  async handleDisconnect(client: Socket) {
    const commercialId = this.connectedAgents.get(client.id);
    if (!commercialId) {
      return;
    }

    this.connectedAgents.delete(client.id);
    this.logger.log(`🔴 Agent ${commercialId} déconnecté du socket ${client.id}`);
    await this.dispatcherOrchestrator.handleUserDisconnected(commercialId);
  }

  /**
   * ---------------------------------------------------------------------------------
   * 📢 MÉTHODES D'ÉMISSION D'ÉVÉNEMENTS
   * ---------------------------------------------------------------------------------
   */

  emitMessageToAgent(commercialId: string, message: WhatsappMessage) {
    const socketId = this.getSocketIdForCommercial(commercialId);
    if (socketId) {
      this.server.to(socketId).emit('message:received', {
        conversationId: message.chat.chat_id,
        message,
      });
    }
  }

  emitNewConversationToAgent(commercialId: string, chat: WhatsappChat) {
    const socketId = this.getSocketIdForCommercial(commercialId);
    if (socketId) {
      this.server.to(socketId).emit('conversation:new', chat);
    }
  }

  emitConversationReassigned(oldCommercialId: string, chat: WhatsappChat) {
    // Notify the old agent
    if(oldCommercialId) {
      const oldSocketId = this.getSocketIdForCommercial(oldCommercialId);
      if (oldSocketId) {
        this.server.to(oldSocketId).emit('conversation:removed', { chatId: chat.id });
      }
    }

    // Notify the new agent
    const newSocketId = this.getSocketIdForCommercial(chat.commercial_id);
    if (newSocketId) {
      this.server.to(newSocketId).emit('conversation:new', chat);
    }
  }

  emitAgentStatusUpdate(commercialId: string, isConnected: boolean) {
    this.server.emit('agent:status', { commercialId, isConnected });
  }

  /**
   * ---------------------------------------------------------------------------------
   * 📥 GESTION DES MESSAGES ENTRANTS DU FRONTEND
   * ---------------------------------------------------------------------------------
   */

  @SubscribeMessage('conversations:get')
  async handleGetConversations(@ConnectedSocket() client: Socket) {
    const commercialId = this.connectedAgents.get(client.id);
    if (!commercialId) {
      return client.emit('error', { message: 'Not authenticated' });
    }

    try {
      const chats = await this.chatService.findByCommercialId(commercialId);
      // This logic could be improved, but for now, we'll keep it simple
      client.emit('conversations:list', chats);
    } catch (error) {
      client.emit('error', {
        message: 'Failed to get conversations',
        details: error.message,
      });
    }
  }

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
      // Ensure the agent is assigned to this chat before fetching messages
      const messages = await this.messageService.findByChatId(
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
      const message = await this.messageService.createAgentMessage({
        chat_id: payload.chatId,
        text: payload.text,
        commercial_id: commercialId,
        timestamp: new Date(),
      });
      // The message will be sent to the client via the Whapi service,
      // and the client will receive it back via the normal incoming message flow.
    } catch (error) {
      client.emit('error', {
        message: 'Failed to send message',
        details: error.message,
      });
    }
  }


  /**
   * ---------------------------------------------------------------------------------
   * 🛠️ MÉTHODES UTILITAIRES
   * ---------------------------------------------------------------------------------
   */

  private getSocketIdForCommercial(commercialId: string): string | undefined {
    for (const [socketId, id] of this.connectedAgents.entries()) {
      if (id === commercialId) {
        return socketId;
      }
    }
    return undefined;
  }
}
