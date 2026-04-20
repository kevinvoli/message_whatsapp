import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialTarget } from './entities/commercial_target.entity';
import { TargetsService } from './targets.service';
import { TargetsController } from './targets.controller';
import { WhatsappMessage } from '../whatsapp_message/entities/whatsapp_message.entity';
import { CallLog } from '../call-log/entities/call_log.entity';
import { FollowUp } from '../follow-up/entities/follow_up.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CommercialTarget, WhatsappMessage, CallLog, FollowUp])],
  providers: [TargetsService],
  controllers: [TargetsController],
  exports: [TargetsService],
})
export class TargetsModule {}
