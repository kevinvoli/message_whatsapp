import { Injectable } from '@nestjs/common';
import { CreateWhatsappChatDto } from './dto/create-whatsapp_chat.dto';
import { UpdateWhatsappChatDto } from './dto/update-whatsapp_chat.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
import { log } from 'console';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class WhatsappChatService {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
        private readonly commercialService : UsersService,
    
  ) {}

  // create(createWhatsappChatDto: CreateWhatsappChatDto) {
  //   return 'This action adds a new whatsappChat';
  // }

  async findOrCreateChat(
    chatId: string,
    from: string,
    fromName: string,
    commercialId: string,
  ): Promise<WhatsappChat> {
    try {
      const chat = await this.chatRepository.findOne({
        where: { chat_id: chatId },
      });
      if (chat) {
        log('chat trouvé ou créé:', chat);
        return chat;
      }
      const commercial = await this.commercialService.findOneById(commercialId);
      console.log("le commercial trouve",commercial);
      
      if (!commercial) {
        throw new Error('Commercial not found');
      }
      console.log("le chat doit etre ici");
      
      const creatChat = this.chatRepository.create({
        chat_id: chatId,
        name: fromName,
        type: 'private', // assuming private chat
        chat_pic: '',
        chat_pic_full: '',
        is_pinned: 'false',
        is_muted: 'false',
        mute_until: '0',
        is_archived: 'false',
        unread_count: '0',
        unread_mention: 'false',
        read_only: 'false',
        not_spam: 'true',
        commercial: commercial,
        last_activity_at: Date.now().toString(),
        created_at: Date.now().toString(),
        updated_at: Date.now().toString(),
      });

      console.log('chat a cree===============================', creatChat);

      return this.chatRepository.save(creatChat);
    } catch (error) {
      console.error('Error finding or creating chat:', error);
      throw new Error(`Failed to find or create chat: ${error}`);
    }
  }

  async findAll(chatId?: string) {
    if (chatId) {
      return this.chatRepository.find({ where: { chat_id: chatId } });
    }
    return this.chatRepository.find();
  }

  findOne(id: string) {
    return `This action returns a #${id} whatsappChat`;
  }

  update(id: string, updateWhatsappChatDto: UpdateWhatsappChatDto) {
    return `This action updates a #${id} whatsappChat`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappChat`;
  }
}
