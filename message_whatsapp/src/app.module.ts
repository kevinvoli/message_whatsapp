import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ErrorModule } from './error/error.module';
import { WhatsappErrorModule } from './whatsapp_error/whatsapp_error.module';
import { WhatsappChatModule } from './whatsapp_chat/whatsapp_chat.module';
import { WhatsappChatLabelModule } from './whatsapp_chat_label/whatsapp_chat_label.module';
import { WhatsappChatParticipantModule } from './whatsapp_chat_participant/whatsapp_chat_participant.module';
import { WhatsappChatEventModule } from './whatsapp_chat_event/whatsapp_chat_event.module';
import { WhatsappChatMessageModule } from './whatsapp_chat_message/whatsapp_chat_message.module';
import { WhatsappMessageModule } from './whatsapp_message/whatsapp_message.module';
import { WhatsappMessageContentModule } from './whatsapp_message_content/whatsapp_message_content.module';
import { WhatsappTextContentModule } from './whatsapp_text_content/whatsapp_text_content.module';
import { WhatsappMediaContentModule } from './whatsapp_media_content/whatsapp_media_content.module';
import { WhatsappInteractiveContentModule } from './whatsapp_interactive_content/whatsapp_interactive_content.module';
import { WhatsappMessageEventModule } from './whatsapp_message_event/whatsapp_message_event.module';
import { WhatsappMessageReactionModule } from './whatsapp_message_reaction/whatsapp_message_reaction.module';
import { WhatsappMessageContextModule } from './whatsapp_message_context/whatsapp_message_context.module';
import { WhatsappConversationModule } from './whatsapp_conversation/whatsapp_conversation.module';
import { WhatsappAgentModule } from './whatsapp_agent/whatsapp_agent.module';
import { WhatsappCustomerModule } from './whatsapp_customer/whatsapp_customer.module';
import { WhatsappContactsModule } from './whatsapp_contacts/whatsapp_contacts.module';
import { WhatsappStatusesModule } from './whatsapp_statuses/whatsapp_statuses.module';
import { WhatsappMediaModule } from './whatsapp_media/whatsapp_media.module';
import { WhatsappLocationContentModule } from './whatsapp_location_content/whatsapp_location_content.module';
import { WhatsappButtonModule } from './whatsapp_button/whatsapp_button.module';
import { WhatsappLastMessageModule } from './whatsapp_last_message/whatsapp_last_message.module';
import { WhapiModule } from './whapi/whapi.module';

@Module({
  imports: [ErrorModule, WhatsappErrorModule, WhatsappChatModule, WhatsappChatLabelModule, WhatsappChatParticipantModule, WhatsappChatEventModule, WhatsappChatMessageModule, WhatsappMessageModule, WhatsappMessageContentModule, WhatsappTextContentModule, WhatsappMediaContentModule, WhatsappInteractiveContentModule, WhatsappMessageEventModule, WhatsappMessageReactionModule, WhatsappMessageContextModule, WhatsappConversationModule, WhatsappAgentModule, WhatsappCustomerModule, WhatsappContactsModule, WhatsappStatusesModule, WhatsappMediaModule, WhatsappLocationContentModule, WhatsappButtonModule, WhatsappLastMessageModule, WhapiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
