import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { MetaAdapter } from './meta.adapter';
import { WhapiAdapter } from './whapi.adapter';
import { ProviderAdapter } from './provider-adapter.interface';

@Injectable()
export class ProviderAdapterRegistry {
  private readonly registry: Record<string, ProviderAdapter<unknown>>;

  constructor(
    private readonly whapiAdapter: WhapiAdapter,
    private readonly metaAdapter: MetaAdapter,
  ) {
    this.registry = {
      whapi: this.whapiAdapter,
      meta: this.metaAdapter,
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
