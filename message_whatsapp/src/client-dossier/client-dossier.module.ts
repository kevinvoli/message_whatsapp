import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from 'src/contact/entities/contact.entity';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { FollowUp } from 'src/follow-up/entities/follow_up.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { ClientDossierService } from './client-dossier.service';
import { ClientDossierController } from './client-dossier.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, CallLog, FollowUp, WhatsappChat, WhatsappMessage]),
  ],
  controllers: [ClientDossierController],
  providers: [ClientDossierService],
  exports: [ClientDossierService],
})
export class ClientDossierModule {}
