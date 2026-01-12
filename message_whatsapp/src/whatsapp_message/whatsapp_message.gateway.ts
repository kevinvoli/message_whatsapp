import { WhatsappMessageService } from './whatsapp_message.service';
import { UpdateWhatsappMessageDto } from './dto/update-whatsapp_message.dto';
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
import { WhapiMessage } from 'src/whapi/interface/whapi-webhook.interface';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappMessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly whatsappMessageService: WhatsappMessageService,
    private readonly chatService: WhatsappChatService,
  ) {}

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log('🟢 Client connecté:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('🔴 Client déconnecté:', client.id);
  }

  // AGENT ONLINE
  // =========================
  @SubscribeMessage('get:conversation')
  async handleAgentOnline(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { agentId: string },
  ) {
    console.log('👨‍💻 Agent en ligne:', data);
    const chat = await this.chatService.findAll();

    console.log('liste des chat ici', chat);

    // MOCK conversations
    client.emit('conversation:get', [...chat]);
  }

  @SubscribeMessage('conversation:join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    console.log('📥 Join conversation:', data.conversationId);

    client.join(data.conversationId);
  }

  //   @SubscribeMessage('get:conversation')
  // handleGetConversation(
  //   @ConnectedSocket() client: Socket,
  //   @MessageBody() data: { conversationId: string },
  // ) {
  //   console.log('📥 Join conversation:', data.conversationId);

  //   client.join(data.conversationId);
  // }

  // =========================
  // SEND MESSAGE
  // =========================
  @SubscribeMessage('agent:message')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; content: string },
  ) {
    console.log('💬 Message agent:', data);

    const message = {
      id: crypto.randomUUID(),
      conversationId: data.conversationId,
      author: 'agent',
      content: data.content,
      createdAt: new Date().toISOString(),
    };

    this.server.to(data.conversationId).emit('message:received', message);
  }

  // AGENT OFFLINE
  // =========================
  @SubscribeMessage('agent:offline')
  handleAgentOffline(@ConnectedSocket() client: Socket) {
    console.log('❌ Agent offline:', client.id);
  }

  @SubscribeMessage('createWhatsappMessage')
  create(@MessageBody() createWhatsappMessageDto: WhapiMessage) {
    return this.whatsappMessageService.create(createWhatsappMessageDto);
  }

  @SubscribeMessage('findAllWhatsappMessage')
  findAll() {
    return this.whatsappMessageService.findAll();
  }

  @SubscribeMessage('findOneWhatsappMessage')
  findOne(@MessageBody() id: string) {
    return this.whatsappMessageService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappMessage')
  update(@MessageBody() updateWhatsappMessageDto: UpdateWhatsappMessageDto) {
    // return this.whatsappMessageService.update(updateWhatsappMessageDto.id, updateWhatsappMessageDto);
  }

  @SubscribeMessage('removeWhatsappMessage')
  remove(@MessageBody() id: string) {
    return this.whatsappMessageService.remove(id);
  }
}
