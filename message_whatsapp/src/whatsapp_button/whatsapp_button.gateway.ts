import { WhatsappButtonService } from './whatsapp_button.service';
import { CreateWhatsappButtonDto } from './dto/create-whatsapp_button.dto';
import { UpdateWhatsappButtonDto } from './dto/update-whatsapp_button.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway()
export class WhatsappButtonGateway {
  constructor(private readonly whatsappButtonService: WhatsappButtonService) {}

  @SubscribeMessage('createWhatsappButton')
  create(@MessageBody() createWhatsappButtonDto: CreateWhatsappButtonDto) {
    return this.whatsappButtonService.create(createWhatsappButtonDto);
  }

  @SubscribeMessage('findAllWhatsappButton')
  findAll() {
    return this.whatsappButtonService.findAll();
  }

  @SubscribeMessage('findOneWhatsappButton')
  findOne(@MessageBody() id: number) {
    return this.whatsappButtonService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappButton')
  update(@MessageBody() updateWhatsappButtonDto: UpdateWhatsappButtonDto) {
    return this.whatsappButtonService.update(updateWhatsappButtonDto.id, updateWhatsappButtonDto);
  }

  @SubscribeMessage('removeWhatsappButton')
  remove(@MessageBody() id: number) {
    return this.whatsappButtonService.remove(id);
  }
}
