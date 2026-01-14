import { WhatsappChatLabelService } from './whatsapp_chat_label.service';
import { CreateWhatsappChatLabelDto } from './dto/create-whatsapp_chat_label.dto';
import { UpdateWhatsappChatLabelDto } from './dto/update-whatsapp_chat_label.dto';
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappChatLabelGateway {
  constructor(
    private readonly whatsappChatLabelService: WhatsappChatLabelService,
  ) {}

  @SubscribeMessage('createWhatsappChatLabel')
  create(
    @MessageBody() createWhatsappChatLabelDto: CreateWhatsappChatLabelDto,
  ) {
    return this.whatsappChatLabelService.create(createWhatsappChatLabelDto);
  }

  @SubscribeMessage('findAllWhatsappChatLabel')
  findAll() {
    return this.whatsappChatLabelService.findAll();
  }

  @SubscribeMessage('findOneWhatsappChatLabel')
  findOne(@MessageBody() id: string) {
    return this.whatsappChatLabelService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappChatLabel')
  update(
    @MessageBody() updateWhatsappChatLabelDto: UpdateWhatsappChatLabelDto,
  ) {
    // return this.whatsappChatLabelService.update(updateWhatsappChatLabelDto.id, updateWhatsappChatLabelDto);
  }

  @SubscribeMessage('removeWhatsappChatLabel')
  remove(@MessageBody() id: string) {
    return this.whatsappChatLabelService.remove(id);
  }
}
