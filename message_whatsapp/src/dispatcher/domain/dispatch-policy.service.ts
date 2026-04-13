import { Injectable, Logger } from '@nestjs/common';
import { QueueService } from '../services/queue.service';
import { ChannelService } from 'src/channel/channel.service';
import { DispatchQueryService } from '../infrastructure/dispatch-query.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';

export interface DispatchDecision {
  /** Poste résolu (dédié ou queue) — null si aucun disponible */
  poste: WhatsappPoste | null;
  /** true si le poste vient d'une règle dédiée (channel → poste fixe) */
  isDedicatedMode: boolean;
}

@Injectable()
export class DispatchPolicyService {
  private readonly logger = new Logger(DispatchPolicyService.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly channelService: ChannelService,
    private readonly queryService: DispatchQueryService,
  ) {}

  /**
   * Résout le poste cible selon la priorité :
   * 1. Poste dédié au channel (si défini) — même offline → EN_ATTENTE sur ce poste
   * 2. Queue globale (si channel non assigné à un poste)
   * Retourne null si aucun poste disponible (mode pool uniquement).
   */
  async resolvePosteForChannel(channelId?: string): Promise<DispatchDecision> {
    if (channelId) {
      const dedicatedPosteId =
        await this.channelService.getDedicatedPosteId(channelId);
      if (dedicatedPosteId) {
        const poste = await this.queryService.findPosteById(dedicatedPosteId);
        if (poste) {
          this.logger.log(
            `Channel "${channelId}" → poste dédié "${poste.name}" (mode dédié)`,
          );
          return { poste, isDedicatedMode: true };
        }
        // Poste dédié introuvable (supprimé sans cascade) → fallback pool
        this.logger.warn(
          `Poste dédié "${dedicatedPosteId}" introuvable pour channel "${channelId}" — fallback queue globale`,
        );
      }
    }
    // Mode pool : queue globale
    const poste = await this.queueService.getNextInQueue();
    return { poste, isDedicatedMode: false };
  }

  /**
   * Détermine si la conversation peut rester sur son poste actuel
   * (cas 1 : agent connecté sur le bon poste dédié ou pool).
   */
  isEligibleForAgentReuse(
    conversation: WhatsappChat,
    dedicatedPosteId: string | null,
    isAgentConnected: boolean,
  ): boolean {
    const currentPosteId = conversation.poste?.id;
    if (!currentPosteId) return false;

    const isOnDedicatedPoste =
      !dedicatedPosteId || currentPosteId === dedicatedPosteId;
    return isAgentConnected && isOnDedicatedPoste;
  }

  /**
   * Détermine si une conversation en réinjection peut être étendue
   * sans être réassignée (channel dédié ou poste seul dans la queue).
   */
  async shouldExtendDeadlineOnly(chat: WhatsappChat): Promise<boolean> {
    const channelId = chat.channel_id ?? chat.last_msg_client_channel_id;
    if (channelId) {
      const dedicatedPosteId =
        await this.channelService.getDedicatedPosteId(channelId);
      if (dedicatedPosteId) {
        this.logger.debug(
          `Reinject ignoré (${chat.chat_id}): channel dédié au poste ${dedicatedPosteId} — deadline étendue`,
        );
        return true;
      }
    }

    if (chat.poste_id) {
      const alternatives =
        await this.queueService.countQueuedPostesExcluding(chat.poste_id);
      if (alternatives === 0) {
        this.logger.debug(
          `Redispatch ignoré (${chat.chat_id}): le poste (${chat.poste_id}) est le seul dans la queue`,
        );
        return true;
      }
    }

    return false;
  }
}
