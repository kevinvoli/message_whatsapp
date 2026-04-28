/**
 * OBL-024 — Tests curseur sync avec tie-breaker timestamp + id
 *
 * Vérifie que syncNewCalls() :
 *  - utilise le tie-breaker (timestamp = X AND id > Y) pour ne pas perdre
 *    des appels ayant le même timestamp
 *  - filtre correctement les appels outgoing ≥ 90s
 *  - ignore les appels missed ou trop courts
 *  - avance le curseur après chaque batch
 */

import { OrderCallSyncService } from '../order-call-sync.service';
import { ORDER_CALL_TYPE_OUTGOING, ORDER_CALL_MIN_DURATION_SEC } from 'src/order-read/entities/order-call-log.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCall(overrides: Record<string, unknown> = {}) {
  return {
    id:           'call-1',
    callType:     ORDER_CALL_TYPE_OUTGOING,
    duration:     ORDER_CALL_MIN_DURATION_SEC, // 90s
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
    where:    jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy:  jest.fn().mockReturnThis(),
    select:   jest.fn().mockReturnThis(),
    limit:    jest.fn().mockReturnThis(),
    take:     jest.fn().mockReturnThis(),
    getOne:   jest.fn().mockResolvedValue(null),
    getMany:  jest.fn().mockResolvedValue([]),
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
    createPending: jest.fn().mockResolvedValue({}),
    markSuccess:   jest.fn().mockResolvedValue({}),
    markFailed:    jest.fn().mockResolvedValue({}),
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
  const orderDb     = makeOrderDb(calls);
  const cursorRepo  = makeCursorRepo(cursor);
  const syncLog     = makeSyncLog();

  const svc = new OrderCallSyncService(
    orderDb as any,
    true, // dbAvailable
    cursorRepo,
    syncLog,
    obligationService,
  );

  return { svc, orderDb, cursorRepo, syncLog };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrderCallSyncService — curseur avec tie-breaker (OBL-009)', () => {
  it('utilise le tie-breaker (timestamp = X AND id > Y) dans la requête', async () => {
    const cursor = makeCursor({
      lastCallTimestamp: new Date('2026-04-28T10:00:00Z'),
      lastCallId: 'call-42',
    });
    const calls = [makeCall({ id: 'call-43', callTimestamp: new Date('2026-04-28T10:00:00Z') })];
    const { svc, orderDb } = buildService(calls, cursor);

    await svc.syncNewCalls();

    const qb = orderDb._qb;
    const whereCall = (qb.where as jest.Mock).mock.calls[0];
    expect(whereCall[0]).toContain('call_timestamp = :since');
    expect(whereCall[0]).toContain('c.id > :lastId');
    expect(whereCall[1]).toMatchObject({ lastId: 'call-42' });
  });

  it('quand le curseur est vierge, utilise new Date(0) et id vide', async () => {
    const cursor = makeCursor({ lastCallTimestamp: null, lastCallId: null });
    const calls  = [makeCall()];
    const { svc, orderDb } = buildService(calls, cursor);

    await svc.syncNewCalls();

    const qb = orderDb._qb;
    const whereCall = (qb.where as jest.Mock).mock.calls[0];
    expect(whereCall[1]).toMatchObject({ lastId: '' });
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
    const svc = new OrderCallSyncService(null, false, {} as any, {} as any, undefined as any);
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

describe('OrderCallSyncService — filtrage obligations (OBL-024)', () => {
  it('appel outgoing ≥ 90s → eligible pour obligation', async () => {
    const call = makeCall({ callType: ORDER_CALL_TYPE_OUTGOING, duration: 90 });
    const obligationService = makeObligationService(true);
    const { svc } = buildService([call], makeCursor(), obligationService);

    const result = await svc.syncNewCalls();
    expect(obligationService.tryMatchCallToTask).toHaveBeenCalledTimes(1);
    expect(result.obligations).toBe(1);
  });

  it('appel outgoing 89s → non eligible (trop court)', async () => {
    const call = makeCall({ callType: ORDER_CALL_TYPE_OUTGOING, duration: 89 });
    const obligationService = makeObligationService();
    const { svc } = buildService([call], makeCursor(), obligationService);

    await svc.syncNewCalls();
    expect(obligationService.tryMatchCallToTask).not.toHaveBeenCalled();
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
