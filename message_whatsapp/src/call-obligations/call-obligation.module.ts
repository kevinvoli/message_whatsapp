import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialObligationBatch } from './entities/commercial-obligation-batch.entity';
import { CallTask } from './entities/call-task.entity';
import { CallObligationService } from './call-obligation.service';
import { CallObligationController } from './call-obligation.controller';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommercialObligationBatch,
      CallTask,
      Contact,
      WhatsappCommercial,
      WhatsappChat,
      WhatsappPoste,
    ]),
  ],
  controllers: [CallObligationController],
  providers: [CallObligationService],
  exports: [CallObligationService],
})
export class CallObligationModule {}
