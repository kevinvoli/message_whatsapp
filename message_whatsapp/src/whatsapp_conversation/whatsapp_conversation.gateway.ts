
import { WhatsappConversationService } from './whatsapp_conversation.service';
import { CreateWhatsappConversationDto } from './dto/create-whatsapp_conversation.dto';
import { UpdateWhatsappConversationDto } from './dto/update-whatsapp_conversation.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';

@WebSocketGateway()
export class WhatsappConversationGateway {
  constructor(private readonly whatsappConversationService: WhatsappConversationService) {}

  @SubscribeMessage('createWhatsappConversation')
  create(@MessageBody() createWhatsappConversationDto: CreateWhatsappConversationDto) {
    return this.whatsappConversationService.create(createWhatsappConversationDto);
  }

  @SubscribeMessage('findAllWhatsappConversation')
  findAll() {
    return this.whatsappConversationService.findAll();
  }

  @SubscribeMessage('findOneWhatsappConversation')
  findOne(@MessageBody() id: string) {
    // return this.whatsappConversationService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappConversation')
  update(@MessageBody() updateWhatsappConversationDto: UpdateWhatsappConversationDto) {
    // return this.whatsappConversationService.update(updateWhatsappConversationDto.id, updateWhatsappConversationDto);
  }

  @SubscribeMessage('removeWhatsappConversation')
  remove(@MessageBody() id: string) {
    return this.whatsappConversationService.remove(id);
  }
}
