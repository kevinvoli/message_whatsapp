
import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { WebsocketGateway } from './websocket.gateway';
import { JwtModule } from '@nestjs/jwt';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';

@Module({
  imports: [AuthModule, JwtModule, WhatsappMessageModule, WhatsappChatModule],
  providers: [WebsocketGateway],
})
export class WebsocketModule {}
