import { Module } from '@nestjs/common';
import { WhatsappErrorService } from './whatsapp_error.service';
import { WhatsappErrorGateway } from './whatsapp_error.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappError } from './entities/whatsapp_error.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappError
        ])],
  providers: [WhatsappErrorGateway, WhatsappErrorService],
})
export class WhatsappErrorModule {}
