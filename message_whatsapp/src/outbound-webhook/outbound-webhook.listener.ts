import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OutboundWebhookService } from './outbound-webhook.service';

/**
 * P6.3 — Transfère les événements internes vers les webhooks sortants.
 * Ajoute tenantId au payload si disponible.
 *
 * Événements relayés :
 *   message.saved           → nouveau message entrant sauvegardé
 *   conversation.closed     → conversation fermée
 *   conversation.assigned   → conversation assignée à un agent
 *   sla.breach              → violation SLA détectée
 *   label.added             → label ajouté à une conversation
 *   broadcast.completed     → broadcast terminé
 */
@Injectable()
export class OutboundWebhookListener {
  constructor(private readonly service: OutboundWebhookService) {}

  @OnEvent('message.saved', { async: true })
  async onMessage(payload: Record<string, unknown> & { tenantId?: string }) {
    if (payload.tenantId) {
      await this.service.dispatch(payload.tenantId, 'message.received', payload).catch(() => {});
    }
  }

  @OnEvent('conversation.closed', { async: true })
  async onConversationClosed(payload: Record<string, unknown> & { tenantId?: string }) {
    if (payload.tenantId) {
      await this.service.dispatch(payload.tenantId, 'conversation.closed', payload).catch(() => {});
    }
  }

  @OnEvent('conversation.assigned', { async: true })
  async onConversationAssigned(payload: Record<string, unknown> & { tenantId?: string }) {
    if (payload.tenantId) {
      await this.service.dispatch(payload.tenantId, 'conversation.assigned', payload).catch(() => {});
    }
  }

  @OnEvent('sla.breach', { async: true })
  async onSlaBreach(payload: Record<string, unknown> & { tenantId?: string }) {
    if (payload.tenantId) {
      await this.service.dispatch(payload.tenantId, 'sla.breach', payload).catch(() => {});
    }
  }

  @OnEvent('label.added', { async: true })
  async onLabelAdded(payload: Record<string, unknown> & { tenantId?: string }) {
    if (payload.tenantId) {
      await this.service.dispatch(payload.tenantId, 'label.added', payload).catch(() => {});
    }
  }

  @OnEvent('broadcast.completed', { async: true })
  async onBroadcastCompleted(payload: Record<string, unknown> & { tenantId?: string }) {
    if (payload.tenantId) {
      await this.service.dispatch(payload.tenantId, 'broadcast.completed', payload).catch(() => {});
    }
  }
}
