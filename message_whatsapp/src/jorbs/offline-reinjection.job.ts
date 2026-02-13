import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { IsNull, Repository } from 'typeorm';

@Injectable()
export class OfflineReinjectionJob {
  private readonly logger = new Logger(OfflineReinjectionJob.name);
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
  ) {}


  async offlineReinject() {
    this.logger.debug('Offline reinjection cron started');

    const chats = await this.chatRepo.find({
      where: {
        status: WhatsappChatStatus.ACTIF,
        last_poste_message_at: IsNull(),
      },
      relations: ['poste'],
    });

    for (const chat of chats) {
      const poste = chat.poste;
      if (!poste) continue;
      if (poste.is_active) continue;

      await this.dispatcher.reinjectConversation(chat);
    }
  }


}
