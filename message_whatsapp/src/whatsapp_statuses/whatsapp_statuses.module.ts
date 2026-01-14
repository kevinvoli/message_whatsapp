import { Module } from '@nestjs/common';
import { WhatsappStatusesService } from './whatsapp_statuses.service';
import { WhatsappStatusesGateway } from './whatsapp_statuses.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappStatus } from './entities/whatsapp_status.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappStatus])],
  providers: [WhatsappStatusesGateway, WhatsappStatusesService],
})
export class WhatsappStatusesModule {}
