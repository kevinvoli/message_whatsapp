import { WhatsappLocationContentService } from './whatsapp_location_content.service';
import { CreateWhatsappLocationContentDto } from './dto/create-whatsapp_location_content.dto';
import { UpdateWhatsappLocationContentDto } from './dto/update-whatsapp_location_content.dto';
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappLocationContentGateway {
  constructor(
    private readonly whatsappLocationContentService: WhatsappLocationContentService,
  ) {}

  @SubscribeMessage('createWhatsappLocationContent')
  create(
    @MessageBody()
    createWhatsappLocationContentDto: CreateWhatsappLocationContentDto,
  ) {
    return this.whatsappLocationContentService.create(
      createWhatsappLocationContentDto,
    );
  }

  @SubscribeMessage('findAllWhatsappLocationContent')
  findAll() {
    return this.whatsappLocationContentService.findAll();
  }

  @SubscribeMessage('findOneWhatsappLocationContent')
  findOne(@MessageBody() id: string) {
    return this.whatsappLocationContentService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappLocationContent')
  update(
    @MessageBody()
    updateWhatsappLocationContentDto: UpdateWhatsappLocationContentDto,
  ) {
    // return this.whatsappLocationContentService.update(updateWhatsappLocationContentDto.id, updateWhatsappLocationContentDto);
  }

  @SubscribeMessage('removeWhatsappLocationContent')
  remove(@MessageBody() id: string) {
    return this.whatsappLocationContentService.remove(id);
  }
}
