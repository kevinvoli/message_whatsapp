/** Émis par FlowBot → écouté par les modules provider pour agir */
export const BOT_ESCALATE_EVENT = 'bot.escalate';
export const BOT_CLOSE_EVENT = 'bot.close';

export class BotEscalateRequestEvent {
  conversationExternalRef: string;
  provider: string;
  agentRef?: string;
  reason: 'timeout' | 'user_request' | 'max_steps' | 'no_flow_match';
}

export class BotCloseRequestEvent {
  conversationExternalRef: string;
  provider: string;
}
