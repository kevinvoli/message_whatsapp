import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkSchedule } from './entities/work-schedule.entity';
import { WorkScheduleService } from './work-schedule.service';
import { WorkScheduleController } from './work-schedule.controller';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { GroupScheduleDay } from 'src/commercial-group/entities/group-schedule-day.entity';
import { DailyResetJob } from './jobs/daily-reset.job';
import { RedisModule } from '../redis/redis.module';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { CommercialGroupModule } from 'src/commercial-group/commercial-group.module';

@Module({
  imports: [TypeOrmModule.forFeature([WorkSchedule, WhatsappCommercial, GroupScheduleDay]), RedisModule, SystemConfigModule, CommercialGroupModule],
  controllers: [WorkScheduleController],
  providers: [WorkScheduleService, DailyResetJob],
  exports: [WorkScheduleService],
})
export class WorkScheduleModule {}
