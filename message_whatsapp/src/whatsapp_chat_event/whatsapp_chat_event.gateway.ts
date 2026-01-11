import { WhatsappChatEventService } from './whatsapp_chat_event.service';
import { CreateWhatsappChatEventDto } from './dto/create-whatsapp_chat_event.dto';
import { UpdateWhatsappChatEventDto } from './dto/update-whatsapp_chat_event.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway()
export class WhatsappChatEventGateway {
  constructor(private readonly whatsappChatEventService: WhatsappChatEventService) {}

  @SubscribeMessage('createWhatsappChatEvent')
  create(@MessageBody() createWhatsappChatEventDto: CreateWhatsappChatEventDto) {
    return this.whatsappChatEventService.create(createWhatsappChatEventDto);
  }

  @SubscribeMessage('findAllWhatsappChatEvent')
  findAll() {
    return this.whatsappChatEventService.findAll();
  }

  @SubscribeMessage('findOneWhatsappChatEvent')
  findOne(@MessageBody() id: string) {
    return this.whatsappChatEventService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappChatEvent')
  update(@MessageBody() updateWhatsappChatEventDto: UpdateWhatsappChatEventDto) {
    // return this.whatsappChatEventService.update(updateWhatsappChatEventDto.id, updateWhatsappChatEventDto);
  }

  @SubscribeMessage('removeWhatsappChatEvent')
  remove(@MessageBody() id: string) {
    return this.whatsappChatEventService.remove(id);
  }
}
