
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
    private messageService: WhatsappMessageService,
    private chatService: WhatsappChatService,
    ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      const user = await this.authService.validateUser(payload.email, null);
      if (!user) {
        client.disconnect();
        return;
      }
      client.data.user = user;
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Handle disconnection logic
  }

  @SubscribeMessage('agent:message')
  async handleAgentMessage(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const { content, conversationId } = data;
    const message = await this.messageService.create({
      chat_id: conversationId,
      text: content,
      from_me: true,
      from: client.data.user.email,
    });
    this.server.to(conversationId).emit('message:received', message);
  }

  @SubscribeMessage('get:conversation')
  async handleGetConversations(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const conversations = await this.chatService.findAll(client.data.user.id);
    client.emit('conversation:list', conversations);
  }

  @SubscribeMessage('get:messages')
  async handleGetMessages(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const { conversationId } = data;
    const messages = await this.messageService.findAll(conversationId);
    client.emit('messages:get', messages);
  }
}
