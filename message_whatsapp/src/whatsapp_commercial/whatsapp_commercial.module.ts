import { Module } from '@nestjs/common';
import { WhatsappCommercialService } from './whatsapp_commercial.service';
import { WhatsappCommercialController } from './whatsapp_commercial.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappCommercial } from './entities/user.entity';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { QueueService } from 'src/dispatcher/services/queue.service';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappCommercial,QueuePosition])],
  controllers: [WhatsappCommercialController],
  providers: [WhatsappCommercialService,QueueService],
  exports: [WhatsappCommercialService],
})
export class WhatsappCommercialModule {}
