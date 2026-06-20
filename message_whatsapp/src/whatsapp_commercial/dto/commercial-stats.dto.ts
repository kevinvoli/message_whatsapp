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

  /**
   * Compteur cumulatif de messages lus stocké sur l'entité WhatsappCommercial
   * (colonne messages_read_count). Mis à jour en temps réel via les triggers métier.
   */
  messagesReadCount: number;

  /**
   * Compteur cumulatif de messages traités stocké sur l'entité WhatsappCommercial
   * (colonne messages_handled_count).
   */
  messagesHandledCount: number;

  /**
   * Nombre de sessions de connexion (messaging_connection_log) sur la période.
   */
  sessionCount: number;
}
