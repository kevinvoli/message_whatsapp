import { WhatsappChatService } from './whatsapp_chat.service';
import { CreateWhatsappChatDto } from './dto/create-whatsapp_chat.dto';
import { UpdateWhatsappChatDto } from './dto/update-whatsapp_chat.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappChatGateway {
  constructor(private readonly whatsappChatService: WhatsappChatService) {}

  @SubscribeMessage('createWhatsappChat')
  create(@MessageBody() createWhatsappChatDto: CreateWhatsappChatDto) {
    return this.whatsappChatService.create(createWhatsappChatDto);
  }

  @SubscribeMessage('findAllWhatsappChat')
  findAll() {
    return this.whatsappChatService.findAll();
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
