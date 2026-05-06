import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappTemplate } from './entities/whatsapp-template.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappTemplateService } from './whatsapp-template.service';
import {
  WhatsappTemplateAdminController,
  WhatsappTemplateAgentController,
} from './whatsapp-template.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappTemplate, WhapiChannel])],
  controllers: [WhatsappTemplateAdminController, WhatsappTemplateAgentController],
  providers: [WhatsappTemplateService],
  exports: [WhatsappTemplateService],
})
export class WhatsappTemplateModule {}
