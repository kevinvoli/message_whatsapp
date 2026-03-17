export interface InstagramSender {
  id: string;
}

export interface InstagramRecipient {
  id: string;
}

export interface InstagramAttachment {
  type:
    | 'image'
    | 'video'
    | 'audio'
    | 'file'
    | 'ig_reel'
    | 'reel'
    | 'share'
    | 'story_mention'
    | 'fallback';
  payload: {
    url?: string;
    title?: string;
    reel_video_id?: string;
  };
}

export interface InstagramReplyTo {
  mid?: string;
  story?: { url: string; id: string };
}

export interface InstagramReaction {
  reaction: string;
  emoji: string;
  action: 'react' | 'unreact';
}

export interface InstagramMessage {
  mid: string;
  text?: string;
  attachments?: InstagramAttachment[];
  reply_to?: InstagramReplyTo;
  reactions?: InstagramReaction;
  is_unsupported?: boolean;
  is_deleted?: boolean;
}

export interface InstagramSeen {
  watermark: number;
}

export interface InstagramReferral {
  ref: string;
  source: string;
  type: string;
}

export interface InstagramMessaging {
  sender: InstagramSender;
  recipient: InstagramRecipient;
  timestamp: number;
  message?: InstagramMessage;
  read?: InstagramSeen;
  referral?: InstagramReferral;
}

export interface InstagramEntry {
  /** instagram_business_account_id */
  id: string;
  time: number;
  messaging: InstagramMessaging[];
}

export interface InstagramWebhookPayload {
  object: 'instagram';
  entry: InstagramEntry[];
}
