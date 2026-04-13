import { WhapiChannel } from '../entities/channel.entity';
import { CreateChannelDto } from '../dto/create-channel.dto';
import { UpdateChannelDto } from '../dto/update-channel.dto';

/**
 * TICKET-05-A — Contrat d'implémentation par provider de canal.
 *
 * Chaque provider (whapi, meta, messenger, instagram, telegram) implémente
 * cette interface. `ChannelService` deviendra une façade qui délègue au
 * provider résolu depuis `ChannelProviderRegistry` (TICKET-05-B).
 *
 * Méthodes obligatoires : create, update.
 * Méthodes optionnelles : validateWebhook (fallback = token-based match),
 *   refreshToken (certains providers n'ont pas de token rotatif).
 */
export interface ChannelProviderStrategy {
  /** Identifiant du provider : 'whapi' | 'meta' | 'messenger' | 'instagram' | 'telegram' */
  readonly provider: string;

  /**
   * Crée un nouveau canal pour ce provider.
   * Peut valider le token en appelant l'API du provider, créer des entrées
   * `ProviderChannel` ou configurer des webhooks.
   */
  create(dto: CreateChannelDto): Promise<WhapiChannel>;

  /**
   * Met à jour un canal existant.
   * Peut reconfigurer les webhooks, mettre à jour le token, etc.
   */
  update(channel: WhapiChannel, dto: UpdateChannelDto): Promise<WhapiChannel>;

  /**
   * Vérifie qu'un verify_token correspond à ce canal.
   * Utilisé pour valider les challenges webhook des providers.
   * Retourne true si le token est valide pour ce canal.
   */
  validateWebhook?(channel: WhapiChannel, verifyToken: string): boolean;

  /**
   * Rafraîchit le token d'accès (si le provider utilise des tokens rotatifs).
   * Retourne le nouveau token ou null si le rafraîchissement a échoué.
   */
  refreshToken?(channel: WhapiChannel): Promise<string | null>;
}
