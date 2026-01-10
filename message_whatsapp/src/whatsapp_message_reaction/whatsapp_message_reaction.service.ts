import { Injectable } from '@nestjs/common';
import { CreateWhatsappMessageReactionDto } from './dto/create-whatsapp_message_reaction.dto';
import { UpdateWhatsappMessageReactionDto } from './dto/update-whatsapp_message_reaction.dto';

@Injectable()
export class WhatsappMessageReactionService {
  create(createWhatsappMessageReactionDto: CreateWhatsappMessageReactionDto) {
    return 'This action adds a new whatsappMessageReaction';
  }

  findAll() {
    return `This action returns all whatsappMessageReaction`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsappMessageReaction`;
  }

  update(id: number, updateWhatsappMessageReactionDto: UpdateWhatsappMessageReactionDto) {
    return `This action updates a #${id} whatsappMessageReaction`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappMessageReaction`;
  }
}
