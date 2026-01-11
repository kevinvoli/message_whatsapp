import { Injectable } from '@nestjs/common';
// import { CreateWhatsappConversationDto } from './dto/create-whatsapp_conversation.dto';
// import { UpdateWhatsappConversationDto } from './dto/update-whatsapp_conversation.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappConversation } from './entities/whatsapp_conversation.entity';

@Injectable()
export class WhatsappConversationService {
  constructor(
      @InjectRepository(WhatsappConversation)
    private readonly repo: Repository<WhatsappConversation>,
  ){}
   create(createWhatsappConversationDto: Partial<WhatsappConversation>) {
    return this.repo.save(this.repo.create(createWhatsappConversationDto));
  }

  findAll() {
    return `This action returns all whatsappConversation`;
  }

  findByChatId(chatId: string) {
    // return this.repo.findOne();
  }



  findById(id: string) {
  return this.repo.findOne({
    where: { id },
    relations: [],
  });
}

 async update(id: string, updateWhatsappConversationDto: Partial<WhatsappConversation>) {
  const conversation= await this.repo.findOne({ where: { id } });

  if (!conversation) {
    return;
  }
    // return this.repo.update(conversation, updateWhatsappConversationDto);
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappConversation`;
  }
}
