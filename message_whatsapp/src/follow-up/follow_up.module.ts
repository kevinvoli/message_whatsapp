import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FollowUp } from './entities/follow_up.entity';
import { FollowUpService } from './follow_up.service';
import { FollowUpController } from './follow_up.controller';
import { FollowUpReminderService } from './follow_up_reminder.service';
import { Contact } from 'src/contact/entities/contact.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FollowUp, Contact])],
  controllers: [FollowUpController],
  providers: [FollowUpService, FollowUpReminderService],
  exports: [FollowUpService],
})
export class FollowUpModule {}
