import { Injectable } from '@nestjs/common';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

/**
 * TICKET-03-D — Règles SLA pures (sans I/O).
 * Appelé par le cron SLA et les use cases reinject/redispatch.
 */
@Injectable()
export class SlaPolicyService {
  // ─── Décisions SLA ──────────────────────────────────────────────────────────

  /**
   * Calcule le seuil de temps (cutoff) à partir duquel un chat est SLA-expiré.
   * @param thresholdMinutes Minutes de délai maximal (configurable admin)
   */
  buildThreshold(thresholdMinutes: number): Date {
    return new Date(Date.now() - thresholdMinutes * 60_000);
  }

  /**
   * Détermine si une conversation doit être réinjectée selon le SLA.
   * Règle : messages non lus ET dernier message client antérieur au seuil.
   */
  shouldReinject(chat: WhatsappChat, threshold: Date): boolean {
    if (!chat.last_client_message_at) return false;
    if ((chat.unread_count ?? 0) <= 0) return false;
    return new Date(chat.last_client_message_at) < threshold;
  }

  /**
   * Vérifie si l'heure courante est dans la plage active (5h–21h).
   * Hors plage : les agents sont hors-ligne, le SLA checker est inutile.
   */
  isBusinessHours(): boolean {
    const hour = new Date().getHours();
    return hour >= 5 && hour < 21;
  }

  // ─── Calculs de deadline ────────────────────────────────────────────────────

  /** Deadline initiale pour une nouvelle conversation (5 min). */
  initialDeadline(): Date {
    return new Date(Date.now() + 5 * 60_000);
  }

  /**
   * Deadline après réinjection SLA (30 min).
   * Alignée sur l'intervalle minimum du cron × 3 pour éviter les boucles.
   */
  reinjectDeadline(): Date {
    return new Date(Date.now() + 30 * 60_000);
  }

  /**
   * Deadline après redispatch manuel (15 min).
   * Plus longue que la deadline initiale pour éviter qu'un grand batch de
   * conversations EN_ATTENTE revienne dans le SLA checker au cycle suivant.
   */
  redispatchDeadline(): Date {
    return new Date(Date.now() + 15 * 60_000);
  }

  // ─── Filtre statut ──────────────────────────────────────────────────────────

  /** Statuts pour lesquels le SLA checker doit surveiller les conversations. */
  slaEligibleStatuses(): WhatsappChatStatus[] {
    return [WhatsappChatStatus.EN_ATTENTE, WhatsappChatStatus.ACTIF];
  }
}
