import { WhatsappMediaContentService } from './whatsapp_media_content.service';
import { CreateWhatsappMediaContentDto } from './dto/create-whatsapp_media_content.dto';
import { UpdateWhatsappMediaContentDto } from './dto/update-whatsapp_media_content.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappMediaContentGateway {
  constructor(private readonly whatsappMediaContentService: WhatsappMediaContentService) {}

  @SubscribeMessage('createWhatsappMediaContent')
  create(@MessageBody() createWhatsappMediaContentDto: CreateWhatsappMediaContentDto) {
    return this.whatsappMediaContentService.create(createWhatsappMediaContentDto);
  }

  @SubscribeMessage('findAllWhatsappMediaContent')
  findAll() {
    return this.whatsappMediaContentService.findAll();
  }

  @SubscribeMessage('findOneWhatsappMediaContent')
  findOne(@MessageBody() id: string) {
    return this.whatsappMediaContentService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappMediaContent')
  update(@MessageBody() updateWhatsappMediaContentDto: UpdateWhatsappMediaContentDto) {
    // return this.whatsappMediaContentService.update(updateWhatsappMediaContentDto.id, updateWhatsappMediaContentDto);
  }

  @SubscribeMessage('removeWhatsappMediaContent')
  remove(@MessageBody() id: string) {
    return this.whatsappMediaContentService.remove(id);
  }
}
