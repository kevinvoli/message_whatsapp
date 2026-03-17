import { ProviderAdapterRegistry } from '../provider-adapter.registry';
import { MetaAdapter } from '../meta.adapter';
import { WhapiAdapter } from '../whapi.adapter';

describe('ProviderAdapterRegistry', () => {
  it('returns whapi and meta adapters', () => {
    const registry = new ProviderAdapterRegistry(
      new WhapiAdapter(),
      new MetaAdapter(),
      {} as any,
      {} as any,
      {} as any,
    );

    expect(registry.getAdapter('whapi')).toBeInstanceOf(WhapiAdapter);
    expect(registry.getAdapter('meta')).toBeInstanceOf(MetaAdapter);
  });

  it('throws for unknown provider', () => {
    const registry = new ProviderAdapterRegistry(
      new WhapiAdapter(),
      new MetaAdapter(),
      {} as any,
      {} as any,
      {} as any,
    );

    expect(() => registry.getAdapter('unknown')).toThrow('Unknown provider');
  });
});
