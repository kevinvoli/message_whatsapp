import { WhatsappMessageContentService } from './whatsapp_message_content.service';
import { CreateWhatsappMessageContentDto } from './dto/create-whatsapp_message_content.dto';
import { UpdateWhatsappMessageContentDto } from './dto/update-whatsapp_message_content.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway()
export class WhatsappMessageContentGateway {
  constructor(private readonly whatsappMessageContentService: WhatsappMessageContentService) {}

  @SubscribeMessage('createWhatsappMessageContent')
  create(@MessageBody() createWhatsappMessageContentDto: CreateWhatsappMessageContentDto) {
    return this.whatsappMessageContentService.create(createWhatsappMessageContentDto);
  }

  @SubscribeMessage('findAllWhatsappMessageContent')
  findAll() {
    return this.whatsappMessageContentService.findAll();
  }

  @SubscribeMessage('findOneWhatsappMessageContent')
  findOne(@MessageBody() id: number) {
    return this.whatsappMessageContentService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappMessageContent')
  update(@MessageBody() updateWhatsappMessageContentDto: UpdateWhatsappMessageContentDto) {
    return this.whatsappMessageContentService.update(updateWhatsappMessageContentDto.id, updateWhatsappMessageContentDto);
  }

  @SubscribeMessage('removeWhatsappMessageContent')
  remove(@MessageBody() id: number) {
    return this.whatsappMessageContentService.remove(id);
  }
}
