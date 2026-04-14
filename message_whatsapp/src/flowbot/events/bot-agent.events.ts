export const BOT_AGENT_CONNECTED_EVENT = 'bot.agent.connected';
export const BOT_AGENT_DISCONNECTED_EVENT = 'bot.agent.disconnected';
export const BOT_CONVERSATION_ASSIGNED_EVENT = 'bot.conversation.assigned';

export class BotAgentConnectedEvent {
  agentRef: string;      // poste_id
  agentName: string;
  provider?: string;     // Si agent dédié à un provider spécifique
}

export class BotAgentDisconnectedEvent {
  agentRef: string;
}

export class BotConversationAssignedEvent {
  conversationExternalRef: string;
  provider: string;
  agentRef: string;
}
