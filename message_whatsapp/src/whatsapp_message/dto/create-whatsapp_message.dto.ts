export class CreateWhatsappMessageDto {
  chat_id: string;
  text: string;
  poste_id: string; // Added
  channel_id: string; // Added
  timestamp: number;
  /** DB UUID of the message to quote (reply feature) */
  quotedMessageId?: string;
}
