import { WhatsappMessageEventService } from './whatsapp_message_event.service';
import { CreateWhatsappMessageEventDto } from './dto/create-whatsapp_message_event.dto';
import { UpdateWhatsappMessageEventDto } from './dto/update-whatsapp_message_event.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappMessageEventGateway {
  constructor(private readonly whatsappMessageEventService: WhatsappMessageEventService) {}

  @SubscribeMessage('createWhatsappMessageEvent')
  create(@MessageBody() createWhatsappMessageEventDto: CreateWhatsappMessageEventDto) {
    return this.whatsappMessageEventService.create(createWhatsappMessageEventDto);
  }

  @SubscribeMessage('findAllWhatsappMessageEvent')
  findAll() {
    return this.whatsappMessageEventService.findAll();
  }

  @SubscribeMessage('findOneWhatsappMessageEvent')
  findOne(@MessageBody() id: string) {
    return this.whatsappMessageEventService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappMessageEvent')
  update(@MessageBody() updateWhatsappMessageEventDto: UpdateWhatsappMessageEventDto) {
    // return this.whatsappMessageEventService.update(updateWhatsappMessageEventDto.id, updateWhatsappMessageEventDto);
  }

  @SubscribeMessage('removeWhatsappMessageEvent')
  remove(@MessageBody() id: string) {
    return this.whatsappMessageEventService.remove(id);
  }
}
