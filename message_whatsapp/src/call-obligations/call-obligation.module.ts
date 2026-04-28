import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialObligationBatch } from './entities/commercial-obligation-batch.entity';
import { CallTask } from './entities/call-task.entity';
import { CallObligationService } from './call-obligation.service';
import { CallObligationController } from './call-obligation.controller';
import { ObligationQualityCheckJob } from './obligation-quality-check.job';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { JorbsModule } from 'src/jorbs/jorbs.module';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommercialObligationBatch,
      CallTask,
      Contact,
      WhatsappCommercial,
      WhatsappChat,
      WhatsappPoste,
      ClientIdentityMapping,
      CommercialIdentityMapping,
    ]),
    JorbsModule,
    SystemConfigModule,
    RedisModule,
  ],
  controllers: [CallObligationController],
  providers: [CallObligationService, ObligationQualityCheckJob],
  exports: [CallObligationService],
})
export class CallObligationModule {}
