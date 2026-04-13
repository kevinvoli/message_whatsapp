import { Injectable, Logger } from '@nestjs/common';
import { ChannelProviderStrategy } from './channel-provider-strategy.interface';

/**
 * TICKET-05-A — Registry des stratégies de provider de canal.
 *
 * Les implémentations (TICKET-05-B) s'enregistrent ici au démarrage
 * via `register()`. `ChannelService` résout le bon provider via `get()`.
 *
 * Le registry est vide pour l'instant — il sera peuplé en Sprint 6
 * (TICKET-05-B : WhapiChannelProvider, MetaChannelProvider, etc.)
 */
@Injectable()
export class ChannelProviderRegistry {
  private readonly logger = new Logger(ChannelProviderRegistry.name);
  private readonly strategies = new Map<string, ChannelProviderStrategy>();

  /**
   * Enregistre une stratégie de provider.
   * Appelé typiquement dans `onModuleInit` de chaque provider.
   */
  register(strategy: ChannelProviderStrategy): void {
    this.strategies.set(strategy.provider, strategy);
    this.logger.debug(`Provider "${strategy.provider}" enregistré`);
  }

  /**
   * Retourne la stratégie pour un provider donné, ou null si non enregistrée.
   * Le fallback vers `ChannelService` inline est géré par l'appelant.
   */
  get(provider: string): ChannelProviderStrategy | null {
    return this.strategies.get(provider) ?? null;
  }

  /** Vérifie si un provider est enregistré. */
  has(provider: string): boolean {
    return this.strategies.has(provider);
  }

  /** Liste des providers enregistrés (utile pour les diagnostics). */
  listProviders(): string[] {
    return Array.from(this.strategies.keys());
  }
}
