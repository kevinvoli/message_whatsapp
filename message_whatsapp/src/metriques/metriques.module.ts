import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetriquesController } from './metriques.controller';
import { MetriquesService } from './metriques.service';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { PendingMessage } from 'src/dispatcher/entities/pending-message.entity';

// Importer vos entités


@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappMessage,
      WhatsappChat,
      WhatsappCommercial,
      Contact,
      WhatsappPoste,
      WhapiChannel,
      PendingMessage,
    ]),
  ],
  controllers: [MetriquesController],
  providers: [MetriquesService],
  exports: [MetriquesService], // Export si vous voulez utiliser le service ailleurs
})
export class MetriquesModule {}