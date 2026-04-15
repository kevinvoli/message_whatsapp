import { Test, TestingModule } from '@nestjs/testing';
import { ContextResolverService } from '../services/context-resolver.service';
import { ContextBinding } from '../entities/context-binding.entity';
import { Context } from '../entities/context.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

const makeContext = (id: string, contextType: Context['contextType']): Context =>
  ({ id, contextType, label: `ctx-${id}`, isActive: true }) as Context;

const makeBinding = (
  contextId: string,
  bindingType: ContextBinding['bindingType'],
  refValue: string,
  context: Context,
): ContextBinding => ({ id: `b-${contextId}`, contextId, bindingType, refValue, context }) as ContextBinding;

describe('ContextResolverService', () => {
  let service: ContextResolverService;

  const bindingRepo = { findOne: jest.fn() };
  const contextRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextResolverService,
        { provide: getRepositoryToken(ContextBinding), useValue: bindingRepo },
        { provide: getRepositoryToken(Context), useValue: contextRepo },
      ],
    }).compile();

    service = module.get<ContextResolverService>(ContextResolverService);
    // Clear in-process cache between tests
    (service as any).cache.clear();
  });

  // ─── RES-01 : priorité CHANNEL ─────────────────────────────────────────────

  it('RES-01 : résout par CHANNEL quand binding CHANNEL existe', async () => {
    const ctx = makeContext('ctx-channel', 'CHANNEL');
    bindingRepo.findOne.mockImplementation(({ where: { bindingType, refValue } }: any) => {
      if (bindingType === 'CHANNEL' && refValue === 'ch-1')
        return Promise.resolve(makeBinding('ctx-channel', 'CHANNEL', 'ch-1', ctx));
      return Promise.resolve(null);
    });

    const result = await service.resolveForChannel('ch-1', 'poste-1', 'whapi');

    expect(result?.id).toBe('ctx-channel');
    // CHANNEL doit être testé en premier — POSTE ne doit jamais être appelé
    const channelCallIndex = bindingRepo.findOne.mock.calls.findIndex(
      ([args]: any[]) => args.where?.bindingType === 'CHANNEL',
    );
    const posteCallIndex = bindingRepo.findOne.mock.calls.findIndex(
      ([args]: any[]) => args.where?.bindingType === 'POSTE',
    );
    expect(channelCallIndex).toBeLessThan(posteCallIndex === -1 ? Infinity : posteCallIndex);
  });

  // ─── RES-02 : fallback POSTE ──────────────────────────────────────────────

  it('RES-02 : fallback sur POSTE quand pas de binding CHANNEL', async () => {
    const ctx = makeContext('ctx-poste', 'POSTE');
    bindingRepo.findOne.mockImplementation(({ where: { bindingType, refValue } }: any) => {
      if (bindingType === 'POSTE' && refValue === 'poste-99')
        return Promise.resolve(makeBinding('ctx-poste', 'POSTE', 'poste-99', ctx));
      return Promise.resolve(null);
    });

    const result = await service.resolveForChannel('ch-unknown', 'poste-99', 'whapi');

    expect(result?.id).toBe('ctx-poste');
  });

  // ─── RES-03 : fallback PROVIDER ───────────────────────────────────────────

  it('RES-03 : fallback sur PROVIDER quand pas de binding CHANNEL/POSTE', async () => {
    const ctx = makeContext('ctx-provider', 'PROVIDER');
    bindingRepo.findOne.mockImplementation(({ where: { bindingType, refValue } }: any) => {
      if (bindingType === 'PROVIDER' && refValue === 'meta')
        return Promise.resolve(makeBinding('ctx-provider', 'PROVIDER', 'meta', ctx));
      return Promise.resolve(null);
    });

    const result = await service.resolveForChannel('ch-x', null, 'meta');

    expect(result?.id).toBe('ctx-provider');
  });

  // ─── RES-04 : fallback POOL ───────────────────────────────────────────────

  it('RES-04 : fallback sur POOL global en dernier recours', async () => {
    const ctx = makeContext('ctx-pool', 'POOL');
    bindingRepo.findOne.mockImplementation(({ where: { bindingType, refValue } }: any) => {
      if (bindingType === 'POOL' && refValue === 'global')
        return Promise.resolve(makeBinding('ctx-pool', 'POOL', 'global', ctx));
      return Promise.resolve(null);
    });

    const result = await service.resolveForChannel('ch-x', null, null);

    expect(result?.id).toBe('ctx-pool');
  });

  // ─── RES-05 : aucun contexte trouvé ──────────────────────────────────────

  it('RES-05 : retourne null si aucun binding ne correspond', async () => {
    bindingRepo.findOne.mockResolvedValue(null);

    const result = await service.resolveForChannel('ch-x', null, null);

    expect(result).toBeNull();
  });

  // ─── RES-06 : contexte inactif ignoré ────────────────────────────────────

  it('RES-06 : contexte inactif → ignoré → essaie niveau suivant', async () => {
    const inactiveCtx = { ...makeContext('ctx-inactive', 'CHANNEL'), isActive: false };
    const activeCtx = makeContext('ctx-pool', 'POOL');

    bindingRepo.findOne.mockImplementation(({ where: { bindingType, refValue } }: any) => {
      if (bindingType === 'CHANNEL')
        return Promise.resolve(makeBinding('ctx-inactive', 'CHANNEL', 'ch-1', inactiveCtx));
      if (bindingType === 'POOL' && refValue === 'global')
        return Promise.resolve(makeBinding('ctx-pool', 'POOL', 'global', activeCtx));
      return Promise.resolve(null);
    });

    const result = await service.resolveForChannel('ch-1', null, null);

    expect(result?.id).toBe('ctx-pool');
  });

  // ─── RES-07 : cache in-process ────────────────────────────────────────────

  it('RES-07 : résolution en cache → findOne appelé une seule fois', async () => {
    const ctx = makeContext('ctx-channel', 'CHANNEL');
    bindingRepo.findOne.mockResolvedValue(makeBinding('ctx-channel', 'CHANNEL', 'ch-cache', ctx));

    await service.resolveForChannel('ch-cache', null, null);
    bindingRepo.findOne.mockClear();
    await service.resolveForChannel('ch-cache', null, null);

    expect(bindingRepo.findOne).not.toHaveBeenCalled();
  });

  // ─── RES-08 : invalidate vide le cache ───────────────────────────────────

  it('RES-08 : invalidate() vide le cache → re-fetch au prochain appel', async () => {
    const ctx = makeContext('ctx-channel', 'CHANNEL');
    bindingRepo.findOne.mockResolvedValue(makeBinding('ctx-channel', 'CHANNEL', 'ch-inv', ctx));

    await service.resolveForChannel('ch-inv', null, null);
    service.invalidate('ch-inv');
    bindingRepo.findOne.mockClear();
    await service.resolveForChannel('ch-inv', null, null);

    expect(bindingRepo.findOne).toHaveBeenCalled();
  });
});
