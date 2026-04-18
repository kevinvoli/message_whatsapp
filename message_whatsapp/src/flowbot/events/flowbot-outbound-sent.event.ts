export const FLOWBOT_OUTBOUND_SENT = 'flowbot.outbound.sent';

export class FlowbotOutboundSentEvent {
  /** chat_id complet (ex: "22556056396@s.whatsapp.net") */
  chatRef: string;
  text: string;
  providerMessageId: string;
  provider: string;
  sentAt: Date;
}
