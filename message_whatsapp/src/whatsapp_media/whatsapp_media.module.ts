import { Module } from '@nestjs/common';
import { WhatsappMediaService } from './whatsapp_media.service';
import { WhatsappMediaGateway } from './whatsapp_media.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMedia } from './entities/whatsapp_media.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappMedia])],
  providers: [WhatsappMediaGateway, WhatsappMediaService],
})
export class WhatsappMediaModule {}
