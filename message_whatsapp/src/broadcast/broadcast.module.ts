import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WhatsappBroadcast } from './entities/broadcast.entity';
import { WhatsappBroadcastRecipient } from './entities/broadcast-recipient.entity';
import { WhatsappTemplate } from 'src/whatsapp-template/entities/whatsapp-template.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { BroadcastService, BROADCAST_QUEUE } from './broadcast.service';
import { BroadcastController } from './broadcast.controller';
import { BroadcastWorker } from './workers/broadcast.worker';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
import { LoggingModule } from 'src/logging/logging.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappBroadcast,
      WhatsappBroadcastRecipient,
      WhatsappTemplate,
      WhapiChannel,
    ]),
    BullModule.registerQueue({ name: BROADCAST_QUEUE }),
    LoggingModule,
  ],
  controllers: [BroadcastController],
  providers: [BroadcastService, BroadcastWorker, CommunicationMetaService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
