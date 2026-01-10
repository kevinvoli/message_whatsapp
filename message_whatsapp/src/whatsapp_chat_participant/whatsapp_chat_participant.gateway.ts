import { WhatsappChatParticipantService } from './whatsapp_chat_participant.service';
import { CreateWhatsappChatParticipantDto } from './dto/create-whatsapp_chat_participant.dto';
import { UpdateWhatsappChatParticipantDto } from './dto/update-whatsapp_chat_participant.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway()
export class WhatsappChatParticipantGateway {
  constructor(private readonly whatsappChatParticipantService: WhatsappChatParticipantService) {}

  @SubscribeMessage('createWhatsappChatParticipant')
  create(@MessageBody() createWhatsappChatParticipantDto: CreateWhatsappChatParticipantDto) {
    return this.whatsappChatParticipantService.create(createWhatsappChatParticipantDto);
  }

  @SubscribeMessage('findAllWhatsappChatParticipant')
  findAll() {
    return this.whatsappChatParticipantService.findAll();
  }

  @SubscribeMessage('findOneWhatsappChatParticipant')
  findOne(@MessageBody() id: number) {
    return this.whatsappChatParticipantService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappChatParticipant')
  update(@MessageBody() updateWhatsappChatParticipantDto: UpdateWhatsappChatParticipantDto) {
    return this.whatsappChatParticipantService.update(updateWhatsappChatParticipantDto.id, updateWhatsappChatParticipantDto);
  }

  @SubscribeMessage('removeWhatsappChatParticipant')
  remove(@MessageBody() id: number) {
    return this.whatsappChatParticipantService.remove(id);
  }
}
