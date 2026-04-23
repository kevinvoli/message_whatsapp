import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from 'src/contact/entities/contact.entity';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { FollowUp } from 'src/follow-up/entities/follow_up.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { ClientDossier } from './entities/client-dossier.entity';
import { ContactPhone } from './entities/contact-phone.entity';
import { ClientDossierService } from './client-dossier.service';
import { ClientDossierController } from './client-dossier.controller';
import { GicopPlatformModule } from 'src/gicop-platform/gicop-platform.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientDossier, ContactPhone, Contact, CallLog, FollowUp, WhatsappChat, WhatsappMessage, WhatsappPoste]),
    GicopPlatformModule,
  ],
  controllers: [ClientDossierController],
  providers: [ClientDossierService],
  exports: [ClientDossierService, TypeOrmModule],
})
export class ClientDossierModule {}
