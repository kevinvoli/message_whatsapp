import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkSchedule } from './entities/work-schedule.entity';
import { WorkScheduleService } from './work-schedule.service';
import { WorkScheduleController } from './work-schedule.controller';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { DailyResetJob } from './jobs/daily-reset.job';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([WorkSchedule, WhatsappCommercial]), RedisModule],
  controllers: [WorkScheduleController],
  providers: [WorkScheduleService, DailyResetJob],
  exports: [WorkScheduleService],
})
export class WorkScheduleModule {}
