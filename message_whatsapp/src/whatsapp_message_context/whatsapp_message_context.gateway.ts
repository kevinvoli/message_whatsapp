import { WhatsappMessageContextService } from './whatsapp_message_context.service';
import { CreateWhatsappMessageContextDto } from './dto/create-whatsapp_message_context.dto';
import { UpdateWhatsappMessageContextDto } from './dto/update-whatsapp_message_context.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway()
export class WhatsappMessageContextGateway {
  constructor(private readonly whatsappMessageContextService: WhatsappMessageContextService) {}

  @SubscribeMessage('createWhatsappMessageContext')
  create(@MessageBody() createWhatsappMessageContextDto: CreateWhatsappMessageContextDto) {
    return this.whatsappMessageContextService.create(createWhatsappMessageContextDto);
  }

  @SubscribeMessage('findAllWhatsappMessageContext')
  findAll() {
    return this.whatsappMessageContextService.findAll();
  }

  @SubscribeMessage('findOneWhatsappMessageContext')
  findOne(@MessageBody() id: string) {
    return this.whatsappMessageContextService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappMessageContext')
  update(@MessageBody() updateWhatsappMessageContextDto: UpdateWhatsappMessageContextDto) {
    // return this.whatsappMessageContextService.update(updateWhatsappMessageContextDto.id, updateWhatsappMessageContextDto);
  }

  @SubscribeMessage('removeWhatsappMessageContext')
  remove(@MessageBody() id: string) {
    return this.whatsappMessageContextService.remove(id);
  }
}
