import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { MetaAdapter } from './meta.adapter';
import { WhapiAdapter } from './whapi.adapter';
import { MessengerAdapter } from './messenger.adapter';
import { InstagramAdapter } from './instagram.adapter';
import { TelegramAdapter } from './telegram.adapter';
import { ProviderAdapter } from './provider-adapter.interface';

@Injectable()
export class ProviderAdapterRegistry {
  private readonly registry: Record<string, ProviderAdapter<unknown>>;

  constructor(
    private readonly whapiAdapter: WhapiAdapter,
    private readonly metaAdapter: MetaAdapter,
    private readonly messengerAdapter: MessengerAdapter,
    private readonly instagramAdapter: InstagramAdapter,
    private readonly telegramAdapter: TelegramAdapter,
  ) {
    this.registry = {
      whapi: this.whapiAdapter,
      meta: this.metaAdapter,
      messenger: this.messengerAdapter,
      instagram: this.instagramAdapter,
      telegram: this.telegramAdapter,
    };
  }

  getAdapter<TPayload>(provider: string): ProviderAdapter<TPayload> {
    const adapter = this.registry[provider];
    if (!adapter) {
      throw new HttpException(
        `Unknown provider: ${provider}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return adapter as ProviderAdapter<TPayload>;
  }
}
