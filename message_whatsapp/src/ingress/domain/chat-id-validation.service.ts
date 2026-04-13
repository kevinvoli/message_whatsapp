/**
 * TICKET-04-A — Validation du chat_id entrant.
 *
 * Service pur (pas d'I/O) extrait de `InboundMessageService.validateIncomingChatId`.
 * Testable sans infrastructure.
 */
import { Injectable } from '@nestjs/common';

export interface ChatIdValidationResult {
  valid: boolean;
  reason?: string;
}

@Injectable()
export class ChatIdValidationService {
  validate(chatId: string | null | undefined): ChatIdValidationResult {
    if (!chatId || typeof chatId !== 'string') {
      return { valid: false, reason: 'missing_chat_id' };
    }

    const trimmed = chatId.trim();

    if (!trimmed.includes('@')) {
      return { valid: false, reason: 'invalid_chat_id_format' };
    }

    if (trimmed.endsWith('@g.us')) {
      return { valid: false, reason: 'group_chat_not_supported' };
    }

    const phoneCandidate = trimmed.split('@')[0] ?? '';
    const normalizedPhone = phoneCandidate.replace(/[^\d]/g, '');

    if (!normalizedPhone) {
      return { valid: false, reason: 'missing_phone_in_chat_id' };
    }

    if (normalizedPhone.length < 8 || normalizedPhone.length > 20) {
      return { valid: false, reason: 'phone_length_out_of_range' };
    }

    return { valid: true };
  }
}
