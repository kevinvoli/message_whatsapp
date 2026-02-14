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
