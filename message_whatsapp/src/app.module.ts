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
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './jorbs/tasks.service';
import { ChannelModule } from './channel/channel.module';
import { ContactModule } from './contact/contact.module';
import { WhatsappPosteModule } from './whatsapp_poste/whatsapp_poste.module';
import { MessageAutoModule } from './message-auto/message-auto.module';
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
import { CampaignLinkModule } from './campaign-link/campaign-link.module';
import { MediaAssetModule } from './media-asset/media-asset.module';
import { ConversationRestrictionModule } from './conversation-restriction/conversation-restriction.module';
import { MediaStorageModule } from './media-storage/media-storage.module';
import { MessageRestrictionModule } from './message-restriction/message-restriction.module';
import { QuizModule } from './quiz/quiz.module';
import { CommercialGroupModule } from './commercial-group/commercial-group.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { HealthModule } from './health/health.module';
import { AdminAuditModule } from './admin-audit/admin-audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappCommercial,
      WhapiChannel,
      WhatsappChat,
      Admin,
    ]),
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1_000,  limit: 20  },
      { name: 'medium', ttl: 10_000, limit: 50  },
      { name: 'long',   ttl: 60_000, limit: 200 },
    ]),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'redis',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    ConfigModule.forRoot({
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
    MessageAutoModule,
    MetriquesModule,
    LoggingModule,
    NotificationModule,
    SystemConfigModule,
    SystemAlertModule,
    CampaignLinkModule,
    MediaAssetModule,
    ConversationRestrictionModule,
    MediaStorageModule,
    MessageRestrictionModule,
    QuizModule,
    CommercialGroupModule,
    HealthModule,
    AdminAuditModule,
  ],
  controllers: [AppController],
  providers: [AppService, TasksService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
