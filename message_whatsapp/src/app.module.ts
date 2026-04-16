import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WhatsappErrorModule } from './whatsapp_error/whatsapp_error.module';
import { WhatsappChatModule } from './whatsapp_chat/whatsapp_chat.module';
import { WhatsappChatLabelModule } from './whatsapp_chat_label/whatsapp_chat_label.module';
import { WhatsappMessageModule } from './whatsapp_message/whatsapp_message.module';
import { WhatsappMessageContentModule } from './whatsapp_message_content/whatsapp_message_content.module';
import { WhatsappCustomerModule } from './whatsapp_customer/whatsapp_customer.module';
import { WhatsappContactsModule } from './whatsapp_contacts/whatsapp_contacts.module';
import { WhatsappMediaModule } from './whatsapp_media/whatsapp_media.module';
import { WhatsappButtonModule } from './whatsapp_button/whatsapp_button.module';
import { WhatsappLastMessageModule } from './whatsapp_last_message/whatsapp_last_message.module';
import { WhapiModule } from './whapi/whapi.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';

import * as Joi from 'joi';
import { DispatcherModule } from './dispatcher/dispatcher.module';
import { CommunicationWhapiModule } from './communication_whapi/communication_whapi.module';
import { AuthModule } from './auth/auth.module';
import { JorbsModule } from './jorbs/jorbs.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelModule } from './channel/channel.module';
import { ContactModule } from './contact/contact.module';
import { WhatsappPosteModule } from './whatsapp_poste/whatsapp_poste.module';
import { AdminModule } from './admin/admin.module';
import { Admin } from './admin/entities/admin.entity';
import { WhatsappCommercial } from './whatsapp_commercial/entities/user.entity'; // Added import
import { WhapiChannel } from './channel/entities/channel.entity'; // Added import
import { WhatsappChat } from './whatsapp_chat/entities/whatsapp_chat.entity'; // Added import
import { AuthAdminModule } from './auth_admin/auth_admin.module'; // Added import
import { MetriquesModule } from './metriques/metriques.module';
import { LoggingModule } from './logging/logging.module';
import { NotificationModule } from './notification/notification.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { SystemAlertModule } from './system-alert/system-alert.module';
import { FlowBotModule } from './flowbot/flowbot.module';
import { MessageAutoCompatModule } from './message-auto-compat/message-auto-compat.module';
import { ContextModule } from './context/context.module';
import { RedisModule } from './redis/redis.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CannedResponseModule } from './canned-response/canned-response.module';
import { ConversationTransferModule } from './conversation-transfer/conversation-transfer.module';
import { LabelModule } from './label/label.module';
import { GdprOptoutModule } from './gdpr-optout/gdpr-optout.module';
import { ConversationMergeModule } from './conversation-merge/conversation-merge.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappCommercial,
      WhapiChannel,
      WhatsappChat,
      Admin,
    ]),
    // P1.4 — Rate-limiting global (brute force protection)
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 20,   // 20 req/s max par IP (anti-flood)
      },
      {
        name: 'medium',
        ttl: 60_000,
        limit: 300,  // 300 req/min par IP
      },
    ]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: false, global: true }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        MYSQL_HOST: Joi.string().required(),
        MYSQL_PORT: Joi.number().required(),
        MYSQL_USER: Joi.string().required(),
        MYSQL_PASSWORD: Joi.string().allow('').required(),
        MYSQL_DATABASE: Joi.string().required(),
        SERVER_PORT: Joi.number().required(),
        TYPEORM_SYNCHRONIZE: Joi.string()
          .valid('true', 'false')
          .default('false'),
        LOG_LEVEL: Joi.string()
          .valid('error', 'warn', 'log', 'debug', 'verbose', 'info')
          .default('info'),
        WHAPI_WEBHOOK_SECRET_HEADER: Joi.string().allow('').optional(),
        WHAPI_WEBHOOK_SECRET_VALUE: Joi.string().allow('').optional(),
        WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS: Joi.string().allow('').optional(),
        FF_UNIFIED_WEBHOOK_ROUTER: Joi.string().optional(),
        FF_SHADOW_UNIFIED: Joi.string().optional(),
        REDIS_HOST: Joi.string().optional(),
        REDIS_PORT: Joi.number().default(6379).optional(),
        REDIS_PASSWORD: Joi.string().allow('').optional(),
        MESSAGE_RESPONSE_TIMEOUT_HOURS: Joi.number()
          .min(1)
          .max(240)
          .default(24),
        ADMIN_NAME: Joi.string().optional(),
        ADMIN_EMAIL: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.string().email().required(),
          otherwise: Joi.string().email().optional(),
        }),
        ADMIN_PASSWORD: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.string().min(12).required(),
          otherwise: Joi.string().min(8).optional(),
        }),
      }).and('WHAPI_WEBHOOK_SECRET_HEADER', 'WHAPI_WEBHOOK_SECRET_VALUE'),
    }),
    DatabaseModule,
    AdminModule,
    WhatsappErrorModule,
    WhatsappChatModule,
    WhatsappChatLabelModule,
    WhatsappMessageModule,
    WhatsappMessageContentModule,
    WhatsappCustomerModule,
    WhatsappContactsModule,
    WhatsappMediaModule,
    WhatsappButtonModule,
    WhatsappLastMessageModule,
    WhapiModule,
    DispatcherModule,
    CommunicationWhapiModule,
    AuthModule,
    AuthAdminModule,
    JorbsModule,
    ChannelModule,
    ContactModule,
    WhatsappPosteModule,
    MetriquesModule,
    LoggingModule,
    NotificationModule,
    SystemConfigModule,
    SystemAlertModule,
    FlowBotModule,
    MessageAutoCompatModule,
    RedisModule,
    ContextModule,
    // Phase 3 — Fonctionnalités de base
    CannedResponseModule,
    ConversationTransferModule,
    LabelModule,
    GdprOptoutModule,
    ConversationMergeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // P1.4 — Activer le guard throttler globalement
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
