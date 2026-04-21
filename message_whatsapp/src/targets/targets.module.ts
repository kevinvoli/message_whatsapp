import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialTarget } from './entities/commercial_target.entity';
import { TargetsService } from './targets.service';
import { TargetsController } from './targets.controller';
import { WhatsappMessage } from '../whatsapp_message/entities/whatsapp_message.entity';
import { CallLog } from '../call-log/entities/call_log.entity';
import { FollowUp } from '../follow-up/entities/follow_up.entity';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommercialTarget, WhatsappMessage, CallLog, FollowUp, WhatsappCommercial]),
    SystemConfigModule,
  ],
  providers: [TargetsService],
  controllers: [TargetsController],
  exports: [TargetsService],
})
export class TargetsModule {}
