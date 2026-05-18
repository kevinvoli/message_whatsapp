import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialGroup } from './entities/commercial-group.entity';
import { CommercialGroupService } from './commercial-group.service';
import { CommercialGroupController } from './commercial-group.controller';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { GroupScheduleDay } from './entities/group-schedule-day.entity';
import { GroupScheduleService } from './group-schedule.service';
import { SystemConfigModule } from 'src/system-config/system-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommercialGroup, WhatsappCommercial, GroupScheduleDay]),
    SystemConfigModule,
  ],
  controllers: [CommercialGroupController],
  providers: [CommercialGroupService, GroupScheduleService],
  exports: [CommercialGroupService, GroupScheduleService],
})
export class CommercialGroupModule {}
