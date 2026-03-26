export interface MetaWebhookPayload {
  object: 'whatsapp_business_account';
  entry: MetaEntry[];
}

export interface MetaEntry {
  id: string;
  changes: MetaChange[];
}

export type MetaWebhookField =
  | 'messages'
  | 'account_update'
  | 'business_status_update'
  | 'phone_number_quality_update'
  | 'account_alerts'
  | 'message_template_status_update'
  | 'message_template_quality_update'
  | 'calls'
  | 'user_preferences'
  | 'flows'
  | string;

export interface MetaChange {
  field: MetaWebhookField;
  value: MetaChangeValue;
}

// ── Non-messages webhook payloads ────────────────────────────────────────────

export interface MetaAccountUpdateValue {
  phone_number?: string;
  event?: string;
  restriction_info?: Array<{ restriction_type?: string; expiration?: string }>;
}

export interface MetaBusinessStatusValue {
  status?: string;
  reason?: string;
}

export interface MetaPhoneQualityValue {
  display_phone_number?: string;
  phone_number_id?: string;
  event?: string;
  current_limit?: string;
}

export interface MetaAccountAlertsValue {
  type?: string;
  entity_type?: string;
  entity_id?: string;
  alert_severity?: string;
  alert_status?: string;
  alert_type?: string;
  account_restriction?: {
    limit_type?: string;
    violation_message?: string;
    restriction_end_time?: number;
  };
}

export interface MetaTemplateStatusValue {
  event?: string;
  message_template_id?: number;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string | null;
}

export interface MetaTemplateQualityValue {
  message_template_id?: number;
  message_template_name?: string;
  message_template_language?: string;
  previous_quality_score?: string;
  new_quality_score?: string;
}

export interface MetaCallsValue {
  from?: string;
  id?: string;
  timestamp?: string;
  status?: 'missed' | 'answered' | 'ringing' | 'hung_up';
  duration?: number;
}

export interface MetaUserPreferencesValue {
  wa_id?: string;
  opt_in_marketing?: boolean;
  messaging_opt_in?: boolean;
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
  | 'button'
  | 'sticker'
  | 'contacts'
  | 'unsupported'
  | 'system'
  | 'reaction';

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

export interface MetaStickerMessage extends MetaMessageBase {
  type: 'sticker';
  sticker: {
    id: string;
    mime_type?: string;
    sha256?: string;
    animated?: boolean;
  };
}

export interface MetaReactionMessage extends MetaMessageBase {
  type: 'reaction';
  reaction: {
    message_id: string;
    emoji: string;
  };
}

export interface MetaContactsMessage extends MetaMessageBase {
  type: 'contacts';
  contacts: Array<{
    name?: { formatted_name?: string };
    phones?: Array<{ phone?: string }>;
  }>;
}

export interface MetaSystemMessage extends MetaMessageBase {
  type: 'system';
  system?: {
    type?: string;
    customer?: string;
    new_wa_id?: string;
    old_wa_id?: string;
    identity?: string;
  };
}

export interface MetaUnsupportedMessage extends MetaMessageBase {
  type: 'unsupported';
}

export type MetaMessage =
  | MetaTextMessage
  | MetaImageMessage
  | MetaAudioMessage
  | MetaVideoMessage
  | MetaDocumentMessage
  | MetaLocationMessage
  | MetaButtonMessage
  | MetaInteractiveMessage
  | MetaStickerMessage
  | MetaReactionMessage
  | MetaContactsMessage
  | MetaSystemMessage
  | MetaUnsupportedMessage;

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
