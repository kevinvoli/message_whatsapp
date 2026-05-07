import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappTemplate } from './entities/whatsapp_template.entity';
import { WhatsappTemplateService } from './whatsapp_template.service';
import { WhatsappTemplateController } from './whatsapp_template.controller';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { LoggingModule } from 'src/logging/logging.module';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappTemplate, WhapiChannel]),
    LoggingModule,
    RedisModule,
  ],
  controllers: [WhatsappTemplateController],
  providers: [WhatsappTemplateService],
  exports: [WhatsappTemplateService, TypeOrmModule],
})
export class WhatsappTemplateModule {}
