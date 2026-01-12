import { WhatsappMessageService } from './whatsapp_message.service';
import { CreateWhatsappMessageDto } from './dto/create-whatsapp_message.dto';
import { UpdateWhatsappMessageDto } from './dto/update-whatsapp_message.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';


@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappMessageGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly whatsappMessageService: WhatsappMessageService) {}

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
  @SubscribeMessage('agent:online')
  handleAgentOnline(@ConnectedSocket() client: Socket) {
    console.log('👨‍💻 Agent en ligne:', client.id);

    // MOCK conversations
    client.emit('conversation:list', [
      {
        id: 'conv-1',
        clientNumber: '+2250700000000',
        clientName: 'Client Test',
        unreadCount: 1,
      },
    ]);
  }

   @SubscribeMessage('conversation:join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    console.log('📥 Join conversation:', data.conversationId);

    client.join(data.conversationId);
  }

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
  create(@MessageBody() createWhatsappMessageDto: CreateWhatsappMessageDto) {
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
