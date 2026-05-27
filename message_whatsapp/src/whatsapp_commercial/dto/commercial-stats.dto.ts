export class CommercialStatsDto {
  messagesRead: number;
  messagesHandled: number;
  activeConversations: number;
  responseRate: number;
  lastActivityAt: Date | null;
  isOnline: boolean;

  /** Conversations dont au moins un message IN a ete lu par ce commercial */
  conversationsReceived: number;

  /** Conversations auxquelles ce commercial a envoye au moins un message OUT */
  conversationsReplied: number;

  /** Conversations dont ce commercial a envoye le dernier message global */
  conversationsHandled: number;

  /** Durée totale de connexion en minutes sur la période */
  totalConnectionMinutes: number;
}
