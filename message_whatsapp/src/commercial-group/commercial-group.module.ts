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
import { CommercialSubGroup } from './entities/commercial-sub-group.entity';
import { SubGroupBreakSchedule } from './entities/sub-group-break-schedule.entity';
import { BreakExclusion } from './entities/break-exclusion.entity';
import { BreakSession } from './entities/break-session.entity';
import { CommercialSubGroupService } from './commercial-sub-group.service';
import { BreakScheduleEngine } from './break-schedule-engine.service';
import { BreakSessionService } from './break-session.service';
import { BreakScheduleService } from './break-schedule.service';
import { BreakExclusionService } from './break-exclusion.service';
import { CommercialBreakController } from './commercial-break.controller';
import { CommercialSubGroupController } from './commercial-sub-group.controller';
import { BreakSupervisionService } from './break-supervision.service';
import { MediaAsset } from 'src/media-asset/entities/media-asset.entity';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommercialGroup,
      WhatsappCommercial,
      GroupScheduleDay,
      CommercialPlanning,
      CommercialSubGroup,
      SubGroupBreakSchedule,
      BreakExclusion,
      BreakSession,
      MediaAsset,
    ]),
    SystemConfigModule,
    ConnectionLogModule,
    WhatsappMessageModule,
  ],
  controllers: [CommercialGroupController, CommercialSelfPlanningController, CommercialBreakController, CommercialSubGroupController],
  providers: [
    CommercialGroupService,
    GroupScheduleService,
    CommercialPlanningService,
    CalendarRegenJob,
    CommercialPresenceHistoryService,
    DisconnectMonitorJob,
    CommercialSubGroupService,
    BreakSupervisionService,
    BreakScheduleEngine,
    BreakSessionService,
    BreakScheduleService,
    BreakExclusionService,
  ],
  exports: [CommercialGroupService, GroupScheduleService, CommercialPlanningService],
})
export class CommercialGroupModule {}
