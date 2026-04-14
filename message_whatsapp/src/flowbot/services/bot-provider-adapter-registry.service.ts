import { Injectable, Logger } from '@nestjs/common';
import { BotProviderAdapter } from '../interfaces/provider-adapter.interface';

@Injectable()
export class BotProviderAdapterRegistry {
  private readonly adapters = new Map<string, BotProviderAdapter>();
  private readonly logger = new Logger(BotProviderAdapterRegistry.name);

  /** Appelé par chaque module provider dans son onModuleInit() */
  register(adapter: BotProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
    this.logger.log(
      `BotProviderAdapter registered: provider="${adapter.provider}" channelType="${adapter.channelType}"`,
    );
  }

  /** Retourne l'adaptateur pour un provider donné — throw si absent */
  get(provider: string): BotProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(
        `Aucun BotProviderAdapter enregistré pour provider="${provider}". Disponibles: [${[...this.adapters.keys()].join(', ')}]`,
      );
    }
    return adapter;
  }

  /** Retourne null au lieu de throw — pour les contextes dégradés */
  getSafe(provider: string): BotProviderAdapter | null {
    return this.adapters.get(provider) ?? null;
  }

  listProviders(): string[] {
    return [...this.adapters.keys()];
  }

  getByChannelType(channelType: string): BotProviderAdapter[] {
    return [...this.adapters.values()].filter((a) => a.channelType === channelType);
  }
}
