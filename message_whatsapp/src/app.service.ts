import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from './whatsapp_commercial/entities/user.entity';
import { WhapiChannel } from './channel/entities/channel.entity';
import { WhatsappChat } from './whatsapp_chat/entities/whatsapp_chat.entity';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getStats() {
    const [commerciaux, canaux, conversations] = await Promise.all([
      this.commercialRepo.count(),
      this.channelRepo.count(),
      this.chatRepo.count(),
    ]);

    return {
      commerciaux,
      canaux,
      conversations,
    };
  }
}
