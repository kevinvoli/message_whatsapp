import { WhatsappMessageReactionService } from './whatsapp_message_reaction.service';
import { CreateWhatsappMessageReactionDto } from './dto/create-whatsapp_message_reaction.dto';
import { UpdateWhatsappMessageReactionDto } from './dto/update-whatsapp_message_reaction.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway()
export class WhatsappMessageReactionGateway {
  constructor(private readonly whatsappMessageReactionService: WhatsappMessageReactionService) {}

  @SubscribeMessage('createWhatsappMessageReaction')
  create(@MessageBody() createWhatsappMessageReactionDto: CreateWhatsappMessageReactionDto) {
    return this.whatsappMessageReactionService.create(createWhatsappMessageReactionDto);
  }

  @SubscribeMessage('findAllWhatsappMessageReaction')
  findAll() {
    return this.whatsappMessageReactionService.findAll();
  }

  @SubscribeMessage('findOneWhatsappMessageReaction')
  findOne(@MessageBody() id: number) {
    return this.whatsappMessageReactionService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappMessageReaction')
  update(@MessageBody() updateWhatsappMessageReactionDto: UpdateWhatsappMessageReactionDto) {
    return this.whatsappMessageReactionService.update(updateWhatsappMessageReactionDto.id, updateWhatsappMessageReactionDto);
  }

  @SubscribeMessage('removeWhatsappMessageReaction')
  remove(@MessageBody() id: number) {
    return this.whatsappMessageReactionService.remove(id);
  }
}
