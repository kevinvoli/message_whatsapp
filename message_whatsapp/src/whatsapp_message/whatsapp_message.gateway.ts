import { WhatsappMessageService } from './whatsapp_message.service';
import { CreateWhatsappMessageDto } from './dto/create-whatsapp_message.dto';
import { UpdateWhatsappMessageDto } from './dto/update-whatsapp_message.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway()
export class WhatsappMessageGateway {
  constructor(private readonly whatsappMessageService: WhatsappMessageService) {}

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
