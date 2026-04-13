/**
 * TICKET-04-A — Enrichissement du message selon le provider.
 *
 * Actuellement : résolution du nom Messenger via Graph API.
 * Extrait de `InboundMessageService.resolveMessengerFromName`.
 *
 * Extensible pour d'autres providers (Telegram display name, Instagram handle, etc.)
 * sans modifier l'orchestrateur.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ChannelService } from 'src/channel/channel.service';
import { CommunicationMessengerService } from 'src/communication_whapi/communication_messenger.service';
import { UnifiedMessage } from 'src/webhooks/normalization/unified-message';

@Injectable()
export class ProviderEnrichmentService {
  private readonly logger = new Logger(ProviderEnrichmentService.name);

  constructor(
    private readonly channelService: ChannelService,
    private readonly messengerService: CommunicationMessengerService,
  ) {}

  /**
   * Enrichit le message avec des données supplémentaires propres au provider
   * (ex. nom de l'expéditeur pour Messenger).
   *
   * Modifie `message` en place (fire-and-forget sur erreur).
   */
  async enrich(message: UnifiedMessage): Promise<void> {
    if (message.provider === 'messenger' && !message.fromName && message.from && message.channelId) {
      message.fromName = await this.resolveMessengerFromName(message.from, message.channelId);
    }
  }

  // ─── Privé ────────────────────────────────────────────────────────────────

  private async resolveMessengerFromName(
    psid: string,
    channelId: string,
  ): Promise<string | undefined> {
    try {
      // Priorité 1 : channel_id (cas normal)
      // Priorité 2 : external_id (page ID) quand channel_id est NULL en BDD
      const channel =
        (await this.channelService.findByChannelId(channelId)) ??
        (await this.channelService.findChannelByExternalId('messenger', channelId));

      if (!channel?.token) return undefined;

      const name = await this.messengerService.getUserName(
        psid,
        channel.token,
        channel.external_id ?? undefined,
      );
      return name ?? undefined;
    } catch (err) {
      this.logger.warn(`resolveMessengerFromName failed for psid=${psid}: ${(err as Error)?.message}`);
      return undefined;
    }
  }
}
