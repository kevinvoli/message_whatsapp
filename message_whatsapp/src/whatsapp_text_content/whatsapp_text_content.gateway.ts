import { WhatsappTextContentService } from './whatsapp_text_content.service';
import { CreateWhatsappTextContentDto } from './dto/create-whatsapp_text_content.dto';
import { UpdateWhatsappTextContentDto } from './dto/update-whatsapp_text_content.dto';
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappTextContentGateway {
  constructor(
    private readonly whatsappTextContentService: WhatsappTextContentService,
  ) {}

  @SubscribeMessage('createWhatsappTextContent')
  create(
    @MessageBody() createWhatsappTextContentDto: CreateWhatsappTextContentDto,
  ) {
    return this.whatsappTextContentService.create(createWhatsappTextContentDto);
  }

  @SubscribeMessage('findAllWhatsappTextContent')
  findAll() {
    return this.whatsappTextContentService.findAll();
  }

  @SubscribeMessage('findOneWhatsappTextContent')
  findOne(@MessageBody() id: string) {
    return this.whatsappTextContentService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappTextContent')
  update(
    @MessageBody() updateWhatsappTextContentDto: UpdateWhatsappTextContentDto,
  ) {
    // return this.whatsappTextContentService.update(updateWhatsappTextContentDto.id, updateWhatsappTextContentDto);
  }

  @SubscribeMessage('removeWhatsappTextContent')
  remove(@MessageBody() id: string) {
    return this.whatsappTextContentService.remove(id);
  }
}
