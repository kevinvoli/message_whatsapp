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
