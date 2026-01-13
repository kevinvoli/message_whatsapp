export class WhatsappMessageResponseDto {
  id: string;
  message_id: string;
  external_id: string;
  chat_id: string;
  conversation_id: string;
  commercial_id: string;
  direction: 'IN' | 'OUT';
  from_me: boolean;
  sender_phone: string;
  sender_name: string;
  timestamp: Date;
  status: string;
  source: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}