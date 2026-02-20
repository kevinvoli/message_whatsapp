interface WhapiMediaPayload {
  id: string;
  link?: string;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
  caption?: string;
}

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
    image?: WhapiMediaPayload;
    video?: WhapiMediaPayload;
    audio?: WhapiMediaPayload;
    voice?: WhapiMediaPayload;
    document?: WhapiMediaPayload;
    gif?: WhapiMediaPayload;
  };
}
