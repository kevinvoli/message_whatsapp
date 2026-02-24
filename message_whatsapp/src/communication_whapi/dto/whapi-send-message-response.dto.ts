/**
 * Réponse de l'API Whapi lors de l'envoi d'un message (POST /messages/{type}).
 * Note : le send response NE contient PAS le champ `link` (URL CDN).
 * Pour obtenir le lien CDN, il faut appeler GET /messages/{id} après l'envoi.
 */
export interface WhapiSendMessageResponse {
  sent: boolean;
  message: {
    id: string;
    from_me: boolean;
    type: string;
    chat_id: string;
    timestamp: number;
    source: string;
    device_id: number;
    status: 'pending' | 'sent' | 'delivered' | 'read';
    from: string;
    text?: {
      body: string;
    };
  };
}
