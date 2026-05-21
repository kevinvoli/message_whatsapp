export class CommercialStatsDto {
  messagesRead: number;
  messagesHandled: number;
  activeConversations: number;
  responseRate: number;
  lastActivityAt: Date | null;
  isOnline: boolean;
}
