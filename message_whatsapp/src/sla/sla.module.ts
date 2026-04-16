import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlaRule } from './entities/sla-rule.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { SlaService } from './sla.service';
import { SlaController } from './sla.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SlaRule, WhatsappChat, WhatsappMessage])],
  providers: [SlaService],
  controllers: [SlaController],
  exports: [SlaService],
})
export class SlaModule {}
