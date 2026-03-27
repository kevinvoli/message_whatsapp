import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CsatResponse } from './entities/csat-response.entity';
import { CsatService } from './csat.service';
import { CsatController } from './csat.controller';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { FeatureFlagModule } from 'src/feature-flags/feature-flag.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CsatResponse, WhatsappChat]),
    WhatsappMessageModule,
    FeatureFlagModule,
  ],
  controllers: [CsatController],
  providers: [CsatService],
})
export class CsatModule {}
