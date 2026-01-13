// dto/conversation-response.dto.ts
export class ConversationResponseDto {
  id: string;
  chat_id: string;
  name: string;
  type: string;
  unread_count: string;
  last_activity_at: string;
  messages: any[];
  commercial_id: string;
  createdAt: Date;
  updatedAt: Date;
}