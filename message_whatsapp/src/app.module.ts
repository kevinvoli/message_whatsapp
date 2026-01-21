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
// import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';

import * as Joi from 'joi';
import { DispatcherModule } from './dispatcher/dispatcher.module';
import { CommunicationWhapiModule } from './communication_whapi/communication_whapi.module';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        MYSQL_HOST:Joi.string().required(),
        MYSQL_PORT:Joi.number().required(),
        MYSQL_USER:Joi.string().required(),
        MYSQL_PASSWORD: Joi.string().allow('').required(),
        MYSQL_DATABASE:Joi.string().required(),
        SERVER_PORT:Joi.number().required()
      })
    }),
    DatabaseModule, WhatsappErrorModule, WhatsappChatModule, WhatsappChatLabelModule, WhatsappMessageModule, WhatsappMessageContentModule,  WhatsappCustomerModule, WhatsappContactsModule, WhatsappMediaModule, WhatsappButtonModule, WhatsappLastMessageModule, WhapiModule, DispatcherModule, CommunicationWhapiModule, AuthModule, RealtimeModule, ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
