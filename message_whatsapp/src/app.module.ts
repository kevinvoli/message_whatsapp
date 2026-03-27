import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentStateModule } from './agent-state/agent-state.module';
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
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './jorbs/tasks.service';
import { ChannelModule } from './channel/channel.module';
import { ContactModule } from './contact/contact.module';
import { WhatsappPosteModule } from './whatsapp_poste/whatsapp_poste.module';
import { MessageAutoModule } from './message-auto/message-auto.module';
import { AdminModule } from './admin/admin.module';
import { WhatsappCommercial } from './whatsapp_commercial/entities/user.entity';
import { WhapiChannel } from './channel/entities/channel.entity';
import { WhatsappChat } from './whatsapp_chat/entities/whatsapp_chat.entity';
import { AuthAdminModule } from './auth_admin/auth_admin.module'; // Added import
import { MetriquesModule } from './metriques/metriques.module';
import { LoggingModule } from './logging/logging.module';
import { NotificationModule } from './notification/notification.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { FeatureFlagModule } from './feature-flags/feature-flag.module';
import { CannedResponsesModule } from './canned-responses/canned-responses.module';
import { ConversationNotesModule } from './conversation-notes/conversation-notes.module';
import { TagsModule } from './tags/tags.module';

@Module({
  imports: [
    // AppService.getStats() utilise ces repos directement — ils restent ici
    // jusqu'à ce qu'AppService soit migré vers un module dédié (Phase E).
    TypeOrmModule.forFeature([
      WhatsappCommercial,
      WhapiChannel,
      WhatsappChat,
    ]),
    EventEmitterModule.forRoot(),
    AgentStateModule,
    ScheduleModule.forRoot(),
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
        WHAPI_WEBHOOK_SECRET_HEADER: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.string().required(),
          otherwise: Joi.string().allow('').optional(),
        }),
        WHAPI_WEBHOOK_SECRET_VALUE: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.string().required(),
          otherwise: Joi.string().allow('').optional(),
        }),
        WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS: Joi.string().allow('').optional(),
        FF_UNIFIED_WEBHOOK_ROUTER: Joi.string().optional(),
        FF_SHADOW_UNIFIED: Joi.string().optional(),
        FF_HMAC_WEBHOOK: Joi.string().optional(),
        FF_PHONE_DEDUP: Joi.string().optional(),
        FF_VOICE_PREVIEW: Joi.string().optional(),
        FF_TYPING_TTL: Joi.string().optional(),
        FF_DISPATCH_LOCK_TIMEOUT: Joi.string().optional(),
        FF_SLA_CRON: Joi.string().optional(),
        FF_TEMPLATE_GUARD: Joi.string().optional(),
        FF_AUTO_MESSAGE_DLQ: Joi.string().optional(),
        FF_REPLY_MESSAGE: Joi.string().optional(),
        MESSAGE_RESPONSE_TIMEOUT_HOURS: Joi.number()
          .min(1)
          .max(240)
          .default(24),
        CORS_ORIGINS: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.string()
            .min(1)
            .required()
            .custom((value, helpers) => {
              if (value === '*' || value.includes('*')) {
                return helpers.error('any.invalid');
              }
              return value;
            })
            .messages({ 'any.invalid': 'CORS_ORIGINS ne peut pas contenir de wildcard (*) en production' }),
          otherwise: Joi.string().allow('').optional(),
        }),
        WS_PORT: Joi.number().default(3001),
        WEBHOOK_GLOBAL_RPS: Joi.number().min(1).optional(),
        WEBHOOK_PROVIDER_RPS: Joi.number().min(1).optional(),
        WEBHOOK_IP_RPS: Joi.number().min(1).optional(),
        WEBHOOK_TENANT_RPM: Joi.number().min(1).optional(),
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
    AdminModule, // Import AdminModule
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
    MessageAutoModule,
    MetriquesModule,
    LoggingModule,
    NotificationModule,
    SystemConfigModule,
    FeatureFlagModule,
    CannedResponsesModule,
    ConversationNotesModule,
    TagsModule,
  ],
  controllers: [AppController],
  providers: [AppService, TasksService],
})
export class AppModule {}
