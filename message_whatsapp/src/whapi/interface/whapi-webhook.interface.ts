export type WhapiEventType =
  | 'message'
  | 'message_ack'
  | 'message_status';

export type WhapiMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document';


export interface WhapiWebhookPayload {
  event: WhapiEventType;
  instance_id: string;

  data: {
    id: string;
    from: string;
    to: string;
    timestamp: number;
    type: WhapiMessageType;

    text?: {
      body: string;
    };

    image?: {
      id: string;
      mime_type: string;
      caption?: string;
    };

    audio?: {
      id: string;
      mime_type: string;
    };

    video?: {
      id: string;
      mime_type: string;
      caption?: string;
    };

    document?: {
      id: string;
      filename: string;
      mime_type: string;
    };
  };
}
