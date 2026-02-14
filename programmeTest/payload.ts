export interface WhapiWebhookPayload {
  messages: WhapiMessage[];
  event: {
    type: 'messages';
    event: 'post';
  };
  channel_id: string;
}

export interface WhapiMessage {
  id: string;
  from_me: boolean;
  type: 'text';
  chat_id: string;
  timestamp: number;
  source: 'mobile';
  from: string;
  from_name?: string;
  text: {
    body: string;
  };
}

export interface MetaWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      field: 'messages';
      value: {
        messaging_product: 'whatsapp';
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts: Array<{
          wa_id: string;
          profile: { name: string };
        }>;
        messages: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: 'text';
          text: { body: string };
        }>;
      };
    }>;
  }>;
}
