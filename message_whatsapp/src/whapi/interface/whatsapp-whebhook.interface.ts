export interface MetaWebhookPayload {
  object: 'whatsapp_business_account';
  entry: MetaEntry[];
}

export interface MetaEntry {
  id: string;
  changes: MetaChange[];
}

export interface MetaChange {
  field: 'messages';
  value: MetaChangeValue;
}

export interface MetaChangeValue {
  messaging_product: 'whatsapp';
  metadata: MetaMetadata;

  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

export interface MetaMetadata {
  display_phone_number: string;
  phone_number_id: string;
}
export interface MetaContact {
  wa_id: string;
  profile: {
    name: string;
  };
}

export interface MetaMessageBase {
  from: string;
  id: string;
  timestamp: string;
  type: MetaMessageType;
}

export type MetaMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'interactive'
  | 'button';

export interface MetaTextMessage extends MetaMessageBase {
  type: 'text';
  text: {
    body: string;
  };
}

export interface MetaImageMessage extends MetaMessageBase {
  type: 'image';
  image: MetaMedia;
}

export interface MetaMedia {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
  url?: string;
}

export interface MetaAudioMessage extends MetaMessageBase {
  type: 'audio';
  audio: MetaMedia;
}

export interface MetaVideoMessage extends MetaMessageBase {
  type: 'video';
  video: MetaMedia;
}

export interface MetaDocumentMessage extends MetaMessageBase {
  type: 'document';
  document: MetaMedia & {
    filename?: string;
  };
}

export interface MetaLocationMessage extends MetaMessageBase {
  type: 'location';
  location: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

export interface MetaButtonMessage extends MetaMessageBase {
  type: 'button';
  button: {
    payload: string;
    text: string;
  };
}

export interface MetaInteractiveMessage extends MetaMessageBase {
  type: 'interactive';
  interactive: {
    type: 'button_reply' | 'list_reply';
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
}

export type MetaMessage =
  | MetaTextMessage
  | MetaImageMessage
  | MetaAudioMessage
  | MetaVideoMessage
  | MetaDocumentMessage
  | MetaLocationMessage
  | MetaButtonMessage
  | MetaInteractiveMessage;

export interface MetaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code: number;
    title: string;
  }>;
}
