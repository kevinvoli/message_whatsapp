import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import {  IsNull, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class FirstResponseTimeoutJob {
  private readonly logger = new Logger(FirstResponseTimeoutJob.name);
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
    private readonly gateway: WhatsappMessageGateway,
  ) {}


@Cron('0 9 * * *')
 async offlineReinject() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  this.logger.debug("Offline reinjection cron started");

  const chats = await this.chatRepo.find({
    where: {
      status: WhatsappChatStatus.ACTIF,
      last_poste_message_at: IsNull(),
    },
    relations: ['poste'],
  });

  this.logger.debug(`Offline reinjection check startOfDay=${startOfDay.toISOString()}`);
  
  for (const chat of chats) {
    const poste = chat.poste;
    if (!poste) continue;

    // const neverConnectedToday =
    //   !poste.lastConnectionAt ||
    //   poste.lastConnectionAt < startOfDay;

    // if (neverConnectedToday) {
    //   await this.dispatcher.reinjectConversation(chat);
    //   // this.gateway.emitConversationReassigned(chat.chat_id);
    // }
  }
}


}
