import { WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { IsNull, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class FirstResponseTimeoutJob {
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
console.log("===================chaque matin===============");

  const chats = await this.chatRepo.find({
    where: {
      status: WhatsappChatStatus.ACTIF,
      last_commercial_message_at: IsNull(),
    },
    relations: ['commercial'],
  });

  console.log("tcher de chaque journe a 9h",startOfDay);
  
  for (const chat of chats) {
    const commercial = chat.commercial;
    if (!commercial) continue;

    const neverConnectedToday =
      !commercial.lastConnectionAt ||
      commercial.lastConnectionAt < startOfDay;

    if (neverConnectedToday) {
      await this.dispatcher.reinjectConversation(chat);
      // this.gateway.emitConversationReassigned(chat.chat_id);
    }
  }
}


}
