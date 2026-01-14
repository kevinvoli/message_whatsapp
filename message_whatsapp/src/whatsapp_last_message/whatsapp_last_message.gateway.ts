import { WhatsappLastMessageService } from './whatsapp_last_message.service';
import { CreateWhatsappLastMessageDto } from './dto/create-whatsapp_last_message.dto';
import { UpdateWhatsappLastMessageDto } from './dto/update-whatsapp_last_message.dto';
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappLastMessageGateway {
  constructor(
    private readonly whatsappLastMessageService: WhatsappLastMessageService,
  ) {}

  @SubscribeMessage('createWhatsappLastMessage')
  create(
    @MessageBody() createWhatsappLastMessageDto: CreateWhatsappLastMessageDto,
  ) {
    return this.whatsappLastMessageService.create(createWhatsappLastMessageDto);
  }

  @SubscribeMessage('findAllWhatsappLastMessage')
  findAll() {
    return this.whatsappLastMessageService.findAll();
  }

  @SubscribeMessage('findOneWhatsappLastMessage')
  findOne(@MessageBody() id: string) {
    return this.whatsappLastMessageService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappLastMessage')
  update(
    @MessageBody() updateWhatsappLastMessageDto: UpdateWhatsappLastMessageDto,
  ) {
    // return this.whatsappLastMessageService.update(updateWhatsappLastMessageDto.id, updateWhatsappLastMessageDto);
  }

  @SubscribeMessage('removeWhatsappLastMessage')
  remove(@MessageBody() id: string) {
    return this.whatsappLastMessageService.remove(id);
  }
}
