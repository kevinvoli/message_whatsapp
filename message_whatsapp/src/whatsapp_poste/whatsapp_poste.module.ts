import { Module } from '@nestjs/common';
import { WhatsappPosteService } from './whatsapp_poste.service';
import { WhatsappPosteController } from './whatsapp_poste.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappPoste } from './entities/whatsapp_poste.entity';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappPoste, WhatsappMedia, WhatsappCommercial])],
  controllers: [WhatsappPosteController],
  providers: [WhatsappPosteService],
})
export class WhatsappPosteModule {}
