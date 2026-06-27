import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialGroup } from './entities/commercial-group.entity';
import { CommercialGroupService } from './commercial-group.service';
import { CommercialGroupController } from './commercial-group.controller';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { GroupScheduleDay } from './entities/group-schedule-day.entity';
import { GroupScheduleService } from './group-schedule.service';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { CommercialPlanning } from './entities/commercial-planning.entity';
import { CommercialPlanningService } from './commercial-planning.service';
import { CalendarRegenJob } from './jobs/calendar-regen.job';
import { CommercialSelfPlanningController } from './commercial-self-planning.controller';
import { CommercialPresenceHistoryService } from './commercial-presence-history.service';
import { ConnectionLogModule } from 'src/connection-log/connection-log.module';
import { DisconnectMonitorJob } from './jobs/disconnect-monitor.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommercialGroup, WhatsappCommercial, GroupScheduleDay, CommercialPlanning]),
    SystemConfigModule,
    ConnectionLogModule,
  ],
  controllers: [CommercialGroupController, CommercialSelfPlanningController],
  providers: [
    CommercialGroupService,
    GroupScheduleService,
    CommercialPlanningService,
    CalendarRegenJob,
    CommercialPresenceHistoryService,
    DisconnectMonitorJob,
  ],
  exports: [CommercialGroupService, GroupScheduleService, CommercialPlanningService],
})
export class CommercialGroupModule {}
