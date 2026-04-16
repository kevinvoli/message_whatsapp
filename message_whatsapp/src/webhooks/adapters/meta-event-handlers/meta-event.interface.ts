/**
 * P4.1 — Interfaces des événements Meta non-message (hors messages/statuses).
 *
 * Ces événements arrivent dans `change.field` ≠ 'messages'.
 */

export interface MetaSecurityEvent {
  type: 'security';
  data: Record<string, unknown>;
}

export interface MetaAccountAlertEvent {
  type: 'account_alerts';
  alerts?: Array<{
    type: string;        // 'PAYMENT_ISSUE' | 'RATE_LIMIT_HIT' | etc.
    message?: string;
  }>;
}

export interface MetaTemplateStatusEvent {
  messageTemplateId: string;
  messageTemplateName: string;
  messageTemplateLanguage?: string;
  event: 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL' | 'REINSTATED' | 'FLAGGED' | 'DELETED';
  reason?: string;
}

export interface MetaAccountUpdateEvent {
  phone_number?: string;
  event?: string;          // 'ACCOUNT_REVIEW_APPROVED' | 'ACCOUNT_BANNED' | etc.
  ban_info?: { waba_ban_state: string; waba_ban_date?: string };
  restriction_info?: Array<{ restriction_type: string; expiration?: string }>;
}

export interface MetaMessagingHandoverEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  pass_thread_control?: { new_owner_app_id: string; metadata?: string };
  take_thread_control?: { previous_owner_app_id: string; metadata?: string };
}

/** Événement générique pour les cas non spécifiés */
export interface MetaUnknownEvent {
  field: string;
  value: unknown;
}

export interface MetaEventContext {
  tenantId: string;
  channelId: string;
  wabaId?: string;
}
