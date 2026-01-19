import { WhatsappChatService } from './whatsapp_chat.service';
import { UpdateWhatsappChatDto } from './dto/update-whatsapp_chat.dto';
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappChatGateway {
  constructor(private readonly whatsappChatService: WhatsappChatService) {}

  @SubscribeMessage('findAllWhatsappChat')
  findAll(@MessageBody() chatId: string) {
    return this.whatsappChatService.findAll(chatId);
  }

  @SubscribeMessage('findOneWhatsappChat')
  findOne(@MessageBody() id: string) {
    return this.whatsappChatService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappChat')
  update(@MessageBody() updateWhatsappChatDto: UpdateWhatsappChatDto) {
    // return this.whatsappChatService.update(updateWhatsappChatDto.id, updateWhatsappChatDto);
  }

  @SubscribeMessage('removeWhatsappChat')
  remove(@MessageBody() id: string) {
    return this.whatsappChatService.remove(id);
  }
}
