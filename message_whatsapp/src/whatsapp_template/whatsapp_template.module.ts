import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappTemplate } from './entities/whatsapp_template.entity';
import { WhatsappTemplateService } from './whatsapp_template.service';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappTemplate])],
  providers: [WhatsappTemplateService],
  exports: [WhatsappTemplateService],
})
export class WhatsappTemplateModule {}
