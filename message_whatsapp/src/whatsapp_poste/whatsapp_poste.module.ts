import { Module } from '@nestjs/common';
import { WhatsappPosteService } from './whatsapp_poste.service';
import { WhatsappPosteController } from './whatsapp_poste.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappPoste } from './entities/whatsapp_poste.entity';

@Module({
  imports: [
        TypeOrmModule.forFeature([
          WhatsappPoste
        ]),
      ],
  controllers: [WhatsappPosteController],
  providers: [WhatsappPosteService],
})
export class WhatsappPosteModule {}
