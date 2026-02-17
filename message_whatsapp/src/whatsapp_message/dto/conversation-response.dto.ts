// dto/conversation-response.dto.ts
import { WhatsappMessageResponseDto } from './whatsapp_message-response.dto';

export class ConversationResponseDto {
  id: string;
  chat_id: string;
  name: string;
  type: string;
  unread_count: string;
  last_activity_at: string;
  messages: WhatsappMessageResponseDto[];
  commercial_id: string;
  createdAt: Date;
  updatedAt: Date;
}
