import { Module } from '@nestjs/common';
import { WhatsappCommercialService } from './whatsapp_commercial.service';
import { WhatsappCommercialController } from './whatsapp_commercial.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappCommercial } from './entities/user.entity';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappCommercial,QueuePosition])],
  controllers: [WhatsappCommercialController],
  providers: [WhatsappCommercialService],
  exports: [WhatsappCommercialService],
})
export class WhatsappCommercialModule {}
