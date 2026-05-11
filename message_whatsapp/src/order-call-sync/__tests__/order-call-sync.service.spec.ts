/**
 * OBL-024 — Tests curseur sync avec tie-breaker timestamp + id
 *
 * Vérifie que syncNewCalls() :
 *  - utilise le tie-breaker (timestamp = X AND id > Y) pour ne pas perdre
 *    des appels ayant le même timestamp
 *  - filtre correctement les appels outgoing (sans condition de durée)
 *  - ignore les appels missed
 *  - avance le curseur après chaque batch
 */

import { OrderCallSyncService } from '../order-call-sync.service';
import { ORDER_CALL_TYPE_OUTGOING } from 'src/order-read/entities/order-call-log.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCall(overrides: Record<string, unknown> = {}) {
  return {
    id:           'call-1',
    callType:     ORDER_CALL_TYPE_OUTGOING,
    duration:     10,
    callTimestamp: new Date('2026-04-28T10:00:00Z'),
    idCommercial: 1,
    idClient:     null,
    localNumber:  '0700000001',
    remoteNumber: '0700000002',
    ...overrides,
  };
}

function makeCursor(overrides: Record<string, unknown> = {}) {
  return {
    scope:             'global',
    lastCallTimestamp: null as Date | null,
    lastCallId:        null as string | null,
    processedCount:    0,
    updatedAt:         new Date(),
    ...overrides,
  };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

function makeCallQb(calls: ReturnType<typeof makeCall>[]) {
  return {
    where:    jest.fn().mockReturnThis(),
    orderBy:  jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take:     jest.fn().mockReturnThis(),
    getMany:  jest.fn().mockResolvedValue(calls),
  };
}

function makeOrderDb(calls: ReturnType<typeof makeCall>[]) {
  const callQb = makeCallQb(calls);

  // QB générique pour les repos secondaires (users, commandes) — retourne null/vide
  const genericQb = {
    where:       jest.fn().mockReturnThis(),
    andWhere:    jest.fn().mockReturnThis(),
    orderBy:     jest.fn().mockReturnThis(),
    select:      jest.fn().mockReturnThis(),
    addSelect:   jest.fn().mockReturnThis(),  // N13 — QueryBuilder device counts
    groupBy:     jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    take:        jest.fn().mockReturnThis(),
    getOne:      jest.fn().mockResolvedValue(null),
    getMany:     jest.fn().mockResolvedValue([]),
    getRawMany:  jest.fn().mockResolvedValue([]),  // N13 — QueryBuilder typé
  };

  let callRepoUsed = false;
  return {
    getRepository: jest.fn().mockImplementation(() => {
      // Premier appel → callRepo (retourne les appels) ; suivants → repos secondaires
      if (!callRepoUsed) {
        callRepoUsed = true;
        return { createQueryBuilder: jest.fn().mockReturnValue(callQb) };
      }
      return { createQueryBuilder: jest.fn().mockReturnValue(genericQb) };
    }),
    _qb: callQb,
  };
}

function makeCursorRepo(cursor: ReturnType<typeof makeCursor>) {
  return {
    findOne: jest.fn().mockResolvedValue(cursor),
    save:    jest.fn().mockImplementation(async (e) => e),
    create:  jest.fn().mockImplementation((e) => e),
    update:  jest.fn().mockResolvedValue({ affected: 1 }),
  } as any;
}

function makeSyncLog() {
  return {
    createPending:      jest.fn().mockResolvedValue({ id: 'log-1' }),
    markSuccess:        jest.fn().mockResolvedValue({}),
    markFailed:         jest.fn().mockResolvedValue({}),
    existsForEntity:    jest.fn().mockResolvedValue(false),
    existsAnyForEntity: jest.fn().mockResolvedValue(false),
  } as any;
}

function makeObligationService(matched = false) {
  return {
    isEnabled:         jest.fn().mockResolvedValue(true),
    tryMatchCallToTask: jest.fn().mockResolvedValue({ matched }),
  } as any;
}

function buildService(
  calls: ReturnType<typeof makeCall>[],
  cursor: ReturnType<typeof makeCursor>,
  obligationService = makeObligationService(),
) {
  const orderDb          = makeOrderDb(calls);
  const cursorRepo       = makeCursorRepo(cursor);
  const syncLog          = makeSyncLog();
  const commercialRepo   = { find: jest.fn().mockResolvedValue([]) } as any;
  const mappingRepo      = { findBy: jest.fn().mockResolvedValue([]) } as any;
  const callEventService = {
    ingestFromDb2:                  jest.fn().mockResolvedValue(undefined),
    getExternalIdsWithoutDeviceId:  jest.fn().mockResolvedValue([]),    // backfill
    applyDeviceIdBatch:             jest.fn().mockResolvedValue(0),
    count:                          jest.fn().mockResolvedValue(0),
    findEligibleForRetry:           jest.fn().mockResolvedValue([]),
  } as any;

  const callDeviceRepo = {
    find:    jest.fn().mockResolvedValue([]),  // N13 — pré-résolution device→commercial
    findOne: jest.fn().mockResolvedValue(null),
    save:    jest.fn().mockResolvedValue({}),
    create:  jest.fn().mockImplementation((x: unknown) => x),
    update:  jest.fn().mockResolvedValue({ affected: 0 }),
  } as any;

  const contactRepo     = { find: jest.fn().mockResolvedValue([]) } as any;
  const clientMappingRepo = { find: jest.fn().mockResolvedValue([]), save: jest.fn().mockResolvedValue({}), create: jest.fn().mockImplementation((x: unknown) => x) } as any;
  const unresolvedRepo  = {
    createQueryBuilder: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      into:   jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    }),
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save:    jest.fn().mockResolvedValue({}),
  } as any;

  const callLogRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save:    jest.fn().mockResolvedValue({}),
    create:  jest.fn().mockImplementation((x: unknown) => x),
  } as any;

  const workScheduleService = {
    getActiveGroupIds: jest.fn().mockResolvedValue([]),
  } as any;

  const svc = new OrderCallSyncService(
    orderDb as any,
    true,
    cursorRepo,
    commercialRepo,
    mappingRepo,
    callDeviceRepo,
    syncLog,
    obligationService,
    callEventService,
    contactRepo,
    clientMappingRepo,
    unresolvedRepo,
    callLogRepo,
    workScheduleService,
  );

  return { svc, orderDb, cursorRepo, syncLog };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrderCallSyncService — curseur avec fenêtre de tolérance (OBL-009)', () => {
  it('utilise call_timestamp >= lookbackSince dans la requête', async () => {
    const cursor = makeCursor({
      lastCallTimestamp: new Date('2026-04-28T10:00:00Z'),
      lastCallId: 'call-42',
    });
    const calls = [makeCall({ id: 'call-43', callTimestamp: new Date('2026-04-28T10:00:00Z') })];
    const { svc, orderDb } = buildService(calls, cursor);

    await svc.syncNewCalls();

    const qb = orderDb._qb;
    const whereCall = (qb.where as jest.Mock).mock.calls[0];
    expect(whereCall[0]).toContain('call_timestamp');
    expect(whereCall[0]).toContain('lookbackSince');
    expect(whereCall[1]).toHaveProperty('lookbackSince');
  });

  it('quand le curseur est vierge, lookbackSince est proche de epoch', async () => {
    const cursor = makeCursor({ lastCallTimestamp: null, lastCallId: null });
    const calls  = [makeCall()];
    const { svc, orderDb } = buildService(calls, cursor);

    await svc.syncNewCalls();

    const qb = orderDb._qb;
    const whereCall = (qb.where as jest.Mock).mock.calls[0];
    const lookbackSince: Date = whereCall[1].lookbackSince;
    expect(lookbackSince.getTime()).toBeLessThan(60_000); // proche de epoch (< 1 min)
  });

  it('avance le curseur avec le timestamp et l\'id du dernier appel traité', async () => {
    const ts = new Date('2026-04-28T10:05:00Z');
    const calls = [makeCall({ id: 'call-99', callTimestamp: ts })];
    const { svc, cursorRepo } = buildService(calls, makeCursor());

    await svc.syncNewCalls();

    expect(cursorRepo.update).toHaveBeenCalledWith(
      { scope: 'global' },
      expect.objectContaining({
        lastCallTimestamp: ts,
        lastCallId: 'call-99',
      }),
    );
  });

  it('ne traite rien si DB2 indisponible', async () => {
    const svc = new OrderCallSyncService(
      null, false,
      {} as any, {} as any, {} as any, {} as any,
      {} as any, undefined as any, {} as any,
      {} as any, {} as any, {} as any,
      {} as any, {} as any,
    );
    const result = await svc.syncNewCalls();
    expect(result).toEqual({ processed: 0, obligations: 0, errors: 0 });
  });

  it('ne traite rien si aucun appel retourné', async () => {
    const { svc, cursorRepo } = buildService([], makeCursor());
    const result = await svc.syncNewCalls();
    expect(result.processed).toBe(0);
    expect(cursorRepo.update).not.toHaveBeenCalled();
  });
});

// ─── T3 : isEligibleForObligation — cas device_id ────────────────────────────

describe('isEligibleForObligation — cas device_id', () => {
  it('outgoing + localNumber présent + deviceId absent → éligible', async () => {
    const call = makeCall({
      callType:    ORDER_CALL_TYPE_OUTGOING,
      localNumber: '0700000001',
      deviceId:    null,
    });
    const obligationService = makeObligationService(true);
    const { svc } = buildService([call], makeCursor(), obligationService);

    await svc.syncNewCalls();

    expect(obligationService.tryMatchCallToTask).toHaveBeenCalledTimes(1);
  });

  it('outgoing + localNumber null + deviceId présent → éligible (cas nouveau)', async () => {
    const call = makeCall({
      callType:    ORDER_CALL_TYPE_OUTGOING,
      localNumber: null,
      deviceId:    'device-abc',
    });
    const obligationService = makeObligationService(true);
    const { svc } = buildService([call], makeCursor(), obligationService);

    await svc.syncNewCalls();

    expect(obligationService.tryMatchCallToTask).toHaveBeenCalledTimes(1);
  });

  it('outgoing + localNumber null + deviceId null → non éligible', async () => {
    const call = makeCall({
      callType:    ORDER_CALL_TYPE_OUTGOING,
      localNumber: null,
      deviceId:    null,
    });
    const obligationService = makeObligationService(true);
    const { svc } = buildService([call], makeCursor(), obligationService);

    await svc.syncNewCalls();

    expect(obligationService.tryMatchCallToTask).not.toHaveBeenCalled();
  });

  it('missed + deviceId présent → non éligible', async () => {
    const call = makeCall({
      callType:    'missed',
      localNumber: null,
      deviceId:    'device-abc',
    });
    const obligationService = makeObligationService(true);
    const { svc } = buildService([call], makeCursor(), obligationService);

    await svc.syncNewCalls();

    expect(obligationService.tryMatchCallToTask).not.toHaveBeenCalled();
  });
});

// ─── T3 : normalizeDuration ───────────────────────────────────────────────────

describe('normalizeDuration', () => {
  it('duration = 0 → retourne 0', () => {
    const { svc } = buildService([], makeCursor());
    expect((svc as any).normalizeDuration(0)).toBe(0);
  });

  it('duration = 120 (secondes, <= 86400) → retourne 120 inchangé', () => {
    const { svc } = buildService([], makeCursor());
    expect((svc as any).normalizeDuration(120)).toBe(120);
  });

  it('duration = 120000 (ms, > 86400) → retourne 120 (divisé par 1000)', () => {
    const { svc } = buildService([], makeCursor());
    expect((svc as any).normalizeDuration(120_000)).toBe(120);
  });

  it('duration = 3600 (1h en secondes, <= 86400) → retourne 3600 inchangé', () => {
    const { svc } = buildService([], makeCursor());
    expect((svc as any).normalizeDuration(3600)).toBe(3600);
  });
});

// ─── T4 : retryUnmatchedObligations — via device_id ──────────────────────────

function makeCallEvent(overrides: Record<string, unknown> = {}) {
  return {
    id:               'evt-uuid-1',
    external_id:      'call-ext-1',
    commercial_phone: '0700000001',
    client_phone:     '0700000002',
    call_status:      ORDER_CALL_TYPE_OUTGOING,
    duration_seconds: 120,
    commercial_id:    null,
    device_id:        null,
    event_at:         new Date('2026-04-28T10:00:00Z'),
    created_at:       new Date(),
    ...overrides,
  };
}

function buildServiceForRetry(opts: {
  candidates: ReturnType<typeof makeCallEvent>[];
  deviceFindOneResult: { posteId: string } | null;
  commercialFindOneResult?: { poste?: { id: string } } | null;
  obligationMatched?: boolean;
  obligationReason?: string;
  syncLogExistsAny?: boolean;
}) {
  const orderDb    = makeOrderDb([]);
  const cursorRepo = makeCursorRepo(makeCursor());

  const syncLog = {
    createPending:    jest.fn().mockResolvedValue({ id: 'log-retry-1' }),
    markSuccess:      jest.fn().mockResolvedValue({}),
    markFailed:       jest.fn().mockResolvedValue({}),
    existsForEntity:  jest.fn().mockResolvedValue(false),
    existsAnyForEntity: jest.fn().mockResolvedValue(opts.syncLogExistsAny ?? false),
  } as any;

  const obligationResult = opts.obligationMatched
    ? { matched: true }
    : { matched: false, reason: opts.obligationReason ?? 'poste_introuvable' };

  const obligationService = {
    isEnabled:          jest.fn().mockResolvedValue(true),
    tryMatchCallToTask: jest.fn().mockResolvedValue(obligationResult),
  } as any;

  const commercialRepo = {
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(opts.commercialFindOneResult ?? null),
  } as any;

  const mappingRepo     = { findBy: jest.fn().mockResolvedValue([]) } as any;

  const callEventService = {
    ingestFromDb2:                 jest.fn().mockResolvedValue(undefined),
    getExternalIdsWithoutDeviceId: jest.fn().mockResolvedValue([]),
    applyDeviceIdBatch:            jest.fn().mockResolvedValue(0),
    count:                         jest.fn().mockResolvedValue(0),
    findEligibleForRetry:          jest.fn().mockResolvedValue(opts.candidates),
  } as any;

  const callDeviceRepo = {
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(opts.deviceFindOneResult),
    save:    jest.fn().mockResolvedValue({}),
    create:  jest.fn().mockImplementation((x: unknown) => x),
    update:  jest.fn().mockResolvedValue({ affected: 0 }),
  } as any;

  const contactRepo       = { find: jest.fn().mockResolvedValue([]) } as any;
  const clientMappingRepo = {
    find:   jest.fn().mockResolvedValue([]),
    save:   jest.fn().mockResolvedValue({}),
    create: jest.fn().mockImplementation((x: unknown) => x),
  } as any;
  const unresolvedRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      insert:   jest.fn().mockReturnThis(),
      into:     jest.fn().mockReturnThis(),
      values:   jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute:  jest.fn().mockResolvedValue({}),
    }),
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save:    jest.fn().mockResolvedValue({}),
  } as any;

  const callLogRepoRetry = {
    findOne: jest.fn().mockResolvedValue(null),
    save:    jest.fn().mockResolvedValue({}),
    create:  jest.fn().mockImplementation((x: unknown) => x),
  } as any;

  const workScheduleServiceRetry = {
    getActiveGroupIds: jest.fn().mockResolvedValue([]),
  } as any;

  const svc = new OrderCallSyncService(
    orderDb as any,
    true,
    cursorRepo,
    commercialRepo,
    mappingRepo,
    callDeviceRepo,
    syncLog,
    obligationService,
    callEventService,
    contactRepo,
    clientMappingRepo,
    unresolvedRepo,
    callLogRepoRetry,
    workScheduleServiceRetry,
  );

  return { svc, syncLog, obligationService, callDeviceRepo, callEventService };
}

describe('retryUnmatchedObligations — via device_id', () => {
  it('call_event avec device_id associé à un poste avec batch actif → retried: 1, matched: 1', async () => {
    const candidate = makeCallEvent({ device_id: 'device-xyz', commercial_id: null });
    const { svc } = buildServiceForRetry({
      candidates:          [candidate],
      deviceFindOneResult: { posteId: 'poste-1' },
      obligationMatched:   true,
    });

    const result = await svc.retryUnmatchedObligations();

    expect(result.retried).toBe(1);
    expect(result.matched).toBe(1);
  });

  it('call_event avec device_id sans poste dans call_device → retried: 0 (call ignoré)', async () => {
    const candidate = makeCallEvent({ device_id: 'device-orphan', commercial_id: null });
    const { svc } = buildServiceForRetry({
      candidates:          [candidate],
      deviceFindOneResult: null, // device inconnu dans call_device
      obligationMatched:   false,
    });

    const result = await svc.retryUnmatchedObligations();

    expect(result.retried).toBe(0);
    expect(result.matched).toBe(0);
  });

  it('call_event sans device_id ET sans commercial_id → retried: 0 (filtré par findEligibleForRetry)', async () => {
    // findEligibleForRetry filtre déjà côté DB — ici on simule un retour vide
    const { svc } = buildServiceForRetry({
      candidates:          [], // filtré avant même d'arriver ici
      deviceFindOneResult: null,
      obligationMatched:   false,
    });

    const result = await svc.retryUnmatchedObligations();

    expect(result.retried).toBe(0);
    expect(result.matched).toBe(0);
  });

  it('call_event déjà en succès dans integration_sync_log → non retryé (idempotence)', async () => {
    // findEligibleForRetry exclut déjà les succès via NOT EXISTS — retour vide
    const { svc, callEventService } = buildServiceForRetry({
      candidates:          [],
      deviceFindOneResult: { posteId: 'poste-1' },
      obligationMatched:   true,
      syncLogExistsAny:    true,
    });

    const result = await svc.retryUnmatchedObligations();

    // findEligibleForRetry a été appelé mais a retourné 0 candidats (déjà en succès côté DB)
    expect(callEventService.findEligibleForRetry).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(0);
    expect(result.matched).toBe(0);
  });
});

describe('OrderCallSyncService — filtrage obligations (OBL-024)', () => {
  it('appel outgoing → eligible pour obligation (quelle que soit la durée)', async () => {
    const call = makeCall({ callType: ORDER_CALL_TYPE_OUTGOING, duration: 5 });
    const obligationService = makeObligationService(true);
    const { svc } = buildService([call], makeCursor(), obligationService);

    const result = await svc.syncNewCalls();
    expect(obligationService.tryMatchCallToTask).toHaveBeenCalledTimes(1);
    expect(result.obligations).toBe(1);
  });

  it('appel missed → non eligible', async () => {
    const call = makeCall({ callType: 'missed', duration: 200 });
    const obligationService = makeObligationService();
    const { svc } = buildService([call], makeCursor(), obligationService);

    await svc.syncNewCalls();
    expect(obligationService.tryMatchCallToTask).not.toHaveBeenCalled();
  });

  it('deux appels traités — cursor avancé au dernier', async () => {
    const t1 = new Date('2026-04-28T10:00:00Z');
    const t2 = new Date('2026-04-28T10:01:00Z');
    const calls = [
      makeCall({ id: 'call-1', callTimestamp: t1 }),
      makeCall({ id: 'call-2', callTimestamp: t2 }),
    ];
    const { svc, cursorRepo } = buildService(calls, makeCursor());

    await svc.syncNewCalls();
    expect(cursorRepo.update).toHaveBeenCalledWith(
      { scope: 'global' },
      expect.objectContaining({ lastCallTimestamp: t2, lastCallId: 'call-2' }),
    );
  });
});
