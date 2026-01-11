import { WhatsappMediaService } from './whatsapp_media.service';
import { CreateWhatsappMediaDto } from './dto/create-whatsapp_media.dto';
import { UpdateWhatsappMediaDto } from './dto/update-whatsapp_media.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway()
export class WhatsappMediaGateway {
  constructor(private readonly whatsappMediaService: WhatsappMediaService) {}

  @SubscribeMessage('createWhatsappMedia')
  create(@MessageBody() createWhatsappMediaDto: CreateWhatsappMediaDto) {
    return this.whatsappMediaService.create(createWhatsappMediaDto);
  }

  @SubscribeMessage('findAllWhatsappMedia')
  findAll() {
    return this.whatsappMediaService.findAll();
  }

  @SubscribeMessage('findOneWhatsappMedia')
  findOne(@MessageBody() id: string) {
    return this.whatsappMediaService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappMedia')
  update(@MessageBody() updateWhatsappMediaDto: UpdateWhatsappMediaDto) {
    // return this.whatsappMediaService.update(updateWhatsappMediaDto.id, updateWhatsappMediaDto);
  }

  @SubscribeMessage('removeWhatsappMedia')
  remove(@MessageBody() id: string) {
    return this.whatsappMediaService.remove(id);
  }
}
