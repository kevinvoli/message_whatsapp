import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { LessThan, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class FirstResponseTimeoutJob {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
    private readonly gateway: WhatsappMessageGateway,
  ) {}


  @Cron('*/10 * * * *')
async enforce24h() {
  const limit = new Date(Date.now() - 24 * 60 * 60 * 1000);

   const chats = await this.chatRepo.find({
    where: {
      read_only: false,
      last_client_message_at: LessThan(limit),
      status: WhatsappChatStatus.ACTIF,
    },
  });

  for (const chat of chats) {
    chat.read_only = true;
    await this.chatRepo.save(chat);

    this.gateway.emitConversationReadonly(chat.chat_id);
  }
}
}

