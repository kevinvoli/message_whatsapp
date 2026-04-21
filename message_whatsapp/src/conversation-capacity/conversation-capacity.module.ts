import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ConversationCapacityService } from './conversation-capacity.service';
import { ConversationCapacityController } from './conversation-capacity.controller';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappChat]), SystemConfigModule, RedisModule],
  controllers: [ConversationCapacityController],
  providers: [ConversationCapacityService],
  exports: [ConversationCapacityService],
})
export class ConversationCapacityModule {}
