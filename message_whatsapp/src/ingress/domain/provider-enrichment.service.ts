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
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { UnifiedMessage } from 'src/webhooks/normalization/unified-message';

@Injectable()
export class ProviderEnrichmentService {
  private readonly logger = new Logger(ProviderEnrichmentService.name);

  constructor(
    private readonly channelService: ChannelService,
    private readonly messengerService: CommunicationMessengerService,
    private readonly whapiService: CommunicationWhapiService,
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

  /**
   * Résout l'URL de la photo de profil de l'expéditeur selon le provider.
   * Ne propage jamais d'erreur — retourne null si indisponible.
   */
  async resolveProfilePicture(message: UnifiedMessage): Promise<string | null> {
    try {
      if (message.provider === 'messenger' && message.from && message.channelId) {
        return await this.resolveMessengerPicture(message.from, message.channelId);
      }
      if (message.provider === 'whapi' && message.from && message.channelId) {
        return await this.resolveWhapiPicture(message.from, message.channelId);
      }
      return null;
    } catch {
      return null;
    }
  }

  // ─── Privé ────────────────────────────────────────────────────────────────

  private async resolveMessengerPicture(psid: string, channelId: string): Promise<string | null> {
    const channel =
      (await this.channelService.findByChannelId(channelId)) ??
      (await this.channelService.findChannelByExternalId('messenger', channelId));
    if (!channel?.token) return null;
    return await this.messengerService.getUserProfilePicture(psid, channel.token, channel.external_id ?? undefined);
  }

  private async resolveWhapiPicture(phone: string, channelId: string): Promise<string | null> {
    const channel = await this.channelService.findByChannelId(channelId);
    if (!channel?.token) return null;
    const cleanPhone = phone.split('@')[0];
    const { thumbUrl } = await this.whapiService.getContactPicture(cleanPhone, channel.token);
    return thumbUrl ?? null;
  }

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
