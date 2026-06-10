import { Module } from '@nestjs/common';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { MessageRestrictionService } from './message-restriction.service';
import {
  MessageRestrictionAdminController,
  MessageRestrictionCommercialController,
} from './message-restriction.controller';

@Module({
  imports: [SystemConfigModule],
  controllers: [
    MessageRestrictionCommercialController,
    MessageRestrictionAdminController,
  ],
  providers: [MessageRestrictionService],
  exports: [MessageRestrictionService],
})
export class MessageRestrictionModule {}
