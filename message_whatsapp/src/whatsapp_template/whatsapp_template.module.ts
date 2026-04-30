import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappTemplate } from './entities/whatsapp_template.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappTemplateService } from './whatsapp_template.service';
import { LoggingModule } from 'src/logging/logging.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappTemplate, WhapiChannel]),
    LoggingModule,
  ],
  providers: [WhatsappTemplateService],
  exports: [WhatsappTemplateService, TypeOrmModule],
})
export class WhatsappTemplateModule {}
