import { WhatsappInteractiveContentService } from './whatsapp_interactive_content.service';
import { CreateWhatsappInteractiveContentDto } from './dto/create-whatsapp_interactive_content.dto';
import { UpdateWhatsappInteractiveContentDto } from './dto/update-whatsapp_interactive_content.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappInteractiveContentGateway {
  constructor(private readonly whatsappInteractiveContentService: WhatsappInteractiveContentService) {}

  @SubscribeMessage('createWhatsappInteractiveContent')
  create(@MessageBody() createWhatsappInteractiveContentDto: CreateWhatsappInteractiveContentDto) {
    return this.whatsappInteractiveContentService.create(createWhatsappInteractiveContentDto);
  }

  @SubscribeMessage('findAllWhatsappInteractiveContent')
  findAll() {
    return this.whatsappInteractiveContentService.findAll();
  }

  @SubscribeMessage('findOneWhatsappInteractiveContent')
  findOne(@MessageBody() id: string) {
    return this.whatsappInteractiveContentService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappInteractiveContent')
  update(@MessageBody() updateWhatsappInteractiveContentDto: UpdateWhatsappInteractiveContentDto) {
    // return this.whatsappInteractiveContentService.update(updateWhatsappInteractiveContentDto.id, updateWhatsappInteractiveContentDto);
  }

  @SubscribeMessage('removeWhatsappInteractiveContent')
  remove(@MessageBody() id: string) {
    return this.whatsappInteractiveContentService.remove(id);
  }
}
