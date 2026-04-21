import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IntegrationService } from './integration.service';

/**
 * Écoute les événements internes et les retransmet vers l'ERP via IntegrationService.
 * Tous les envois sont fire-and-forget (catch silencieux).
 */
@Injectable()
export class IntegrationListener {
  constructor(private readonly service: IntegrationService) {}

  @OnEvent('contact.created', { async: true })
  async onContactCreated(payload: {
    contactId: string;
    phone: string;
    name: string;
    source?: string;
    poste_id?: string;
  }) {
    await this.service.dispatchLeadCreated(payload).catch(() => {});
  }

  @OnEvent('contact.updated', { async: true })
  async onContactUpdated(payload: {
    contactId: string;
    phone?: string;
    changes: Record<string, unknown>;
  }) {
    await this.service.dispatchClientUpdated(payload).catch(() => {});
  }

  @OnEvent('conversation.status_changed', { async: true })
  async onConversationStatusChanged(payload: {
    chatId: string;
    contactId?: string;
    oldStatus: string;
    newStatus: string;
    result?: string | null;
  }) {
    await this.service.dispatchConversationStatusChanged(payload).catch(() => {});
  }

  @OnEvent('follow_up.created', { async: true })
  async onFollowUpCreated(payload: {
    followUpId: string;
    contactId: string;
    commercialId: string;
    scheduledAt: Date;
    notes?: string;
  }) {
    await this.service.dispatchFollowUpCreated(payload).catch(() => {});
  }

  @OnEvent('follow_up.completed', { async: true })
  async onFollowUpCompleted(payload: {
    followUpId: string;
    contactId: string;
    commercialId: string;
    outcome?: string;
    completedAt: Date;
  }) {
    await this.service.dispatchFollowUpCompleted(payload).catch(() => {});
  }
}
