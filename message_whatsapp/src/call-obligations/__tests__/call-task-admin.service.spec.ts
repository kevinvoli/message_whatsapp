import { CallTaskAdminService } from '../call-task-admin.service';
import { CallTask, CallTaskCategory, CallTaskStatus } from '../entities/call-task.entity';
import { CommercialObligationBatch } from '../entities/commercial-obligation-batch.entity';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCallTask(overrides: Partial<CallTask> = {}): CallTask {
  return Object.assign(new CallTask(), {
    id:              'ct-1',
    batchId:         'batch-1',
    posteId:         'poste-1',
    category:        CallTaskCategory.JAMAIS_COMMANDE,
    status:          CallTaskStatus.PENDING,
    clientPhone:     '+2250700000001',
    callEventId:     null,
    durationSeconds: null,
    completedAt:     null,
    createdAt:       new Date('2026-05-12T09:00:00Z'),
    ...overrides,
  });
}

function makeCallTaskRepo(tasks: CallTask[] = []) {
  const countFn = jest.fn().mockResolvedValue(tasks.length);
  const qb: any = {
    select:       jest.fn().mockReturnThis(),
    addSelect:    jest.fn().mockReturnThis(),
    leftJoin:     jest.fn().mockReturnThis(),
    where:        jest.fn().mockReturnThis(),
    andWhere:     jest.fn().mockReturnThis(),
    groupBy:      jest.fn().mockReturnThis(),
    orderBy:      jest.fn().mockReturnThis(),
    offset:       jest.fn().mockReturnThis(),
    limit:        jest.fn().mockReturnThis(),
    getCount:     jest.fn().mockResolvedValue(tasks.length),
    getRawOne:    jest.fn().mockResolvedValue({ avg: null }),
    getRawMany:   jest.fn().mockResolvedValue(tasks),
  };
  return {
    count:                 countFn,
    createQueryBuilder:    jest.fn().mockReturnValue(qb),
    _qb:                   qb,
  } as any;
}

function makeBatchRepo() {
  return {} as any;
}

function makePosteRepo() {
  return { find: jest.fn().mockResolvedValue([]) } as any;
}

function makeCommercialRepo() {
  const qb: any = {
    innerJoin:   jest.fn().mockReturnThis(),
    leftJoin:    jest.fn().mockReturnThis(),
    select:      jest.fn().mockReturnThis(),
    addSelect:   jest.fn().mockReturnThis(),
    where:       jest.fn().mockReturnThis(),
    orderBy:     jest.fn().mockReturnThis(),
    addOrderBy:  jest.fn().mockReturnThis(),
    getRawMany:  jest.fn().mockResolvedValue([]),
  };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    manager: { query: jest.fn().mockResolvedValue([]) },
    _qb: qb,
  } as any;
}

function buildService(
  callTaskRepo   = makeCallTaskRepo(),
  batchRepo      = makeBatchRepo(),
  posteRepo      = makePosteRepo(),
  commercialRepo = makeCommercialRepo(),
) {
  return new CallTaskAdminService(callTaskRepo, batchRepo, posteRepo, commercialRepo);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CallTaskAdminService', () => {

  describe('getMetrics()', () => {

    it('retourne les compteurs corrects pour une categorie', async () => {
      const repo = makeCallTaskRepo();
      repo.count
        .mockResolvedValueOnce(3)   // totalToday
        .mockResolvedValueOnce(8)   // totalPending
        .mockResolvedValueOnce(12); // totalDone
      repo._qb.getRawOne.mockResolvedValue({ avg: '185.5' });
      repo._qb.getRawMany.mockResolvedValue([
        { posteId: 'poste-1', count: '4' },
        { posteId: 'poste-2', count: '2' },
      ]);

      const svc = buildService(repo);
      const m = await svc.getMetrics(CallTaskCategory.JAMAIS_COMMANDE);

      expect(m.totalToday).toBe(3);
      expect(m.totalPending).toBe(8);
      expect(m.totalDone).toBe(12);
      expect(m.avgDurationSeconds).toBe(186);  // Math.round(185.5)
      expect(m.topPostesOverdue).toEqual([
        { posteId: 'poste-1', posteName: null, count: 4 },
        { posteId: 'poste-2', posteName: null, count: 2 },
      ]);
    });

    it('retourne avgDurationSeconds null si aucune tache DONE', async () => {
      const repo = makeCallTaskRepo();
      repo._qb.getRawOne.mockResolvedValue({ avg: null });
      repo._qb.getRawMany.mockResolvedValue([]);

      const svc = buildService(repo);
      const m = await svc.getMetrics(CallTaskCategory.COMMANDE_ANNULEE);

      expect(m.avgDurationSeconds).toBeNull();
      expect(m.topPostesOverdue).toEqual([]);
    });
  });

  describe('list()', () => {

    it('retourne les items et le total pour une categorie', async () => {
      const tasks = [
        makeCallTask({ id: 'ct-1', status: CallTaskStatus.DONE }),
        makeCallTask({ id: 'ct-2', status: CallTaskStatus.PENDING }),
      ];
      const repo = makeCallTaskRepo(tasks);
      repo._qb.getCount.mockResolvedValue(42);
      repo._qb.getRawMany.mockResolvedValue(tasks);

      const svc = buildService(repo);
      const result = await svc.list({
        category: CallTaskCategory.JAMAIS_COMMANDE,
        page: 1,
        limit: 50,
      });

      expect(result.total).toBe(42);
      expect(result.items).toHaveLength(2);
      expect(repo._qb.where).toHaveBeenCalledWith('ct.category = :category', {
        category: CallTaskCategory.JAMAIS_COMMANDE,
      });
    });

    it('applique le filtre status', async () => {
      const repo = makeCallTaskRepo();
      repo._qb.getCount.mockResolvedValue(5);
      repo._qb.getRawMany.mockResolvedValue([]);

      const svc = buildService(repo);
      await svc.list({
        category: CallTaskCategory.COMMANDE_AVEC_LIVRAISON,
        status:   CallTaskStatus.DONE,
        page:     1,
        limit:    50,
      });

      expect(repo._qb.andWhere).toHaveBeenCalledWith(
        'ct.status = :status',
        { status: CallTaskStatus.DONE },
      );
    });

    it('applique le filtre posteId', async () => {
      const repo = makeCallTaskRepo();
      repo._qb.getCount.mockResolvedValue(2);
      repo._qb.getRawMany.mockResolvedValue([]);

      const svc = buildService(repo);
      await svc.list({
        category: CallTaskCategory.COMMANDE_ANNULEE,
        posteId:  'poste-xyz',
        page:     1,
        limit:    50,
      });

      expect(repo._qb.andWhere).toHaveBeenCalledWith(
        'ct.posteId = :posteId',
        { posteId: 'poste-xyz' },
      );
    });

    it('calcule le bon offset pour la page 2', async () => {
      const repo = makeCallTaskRepo();
      repo._qb.getCount.mockResolvedValue(120);
      repo._qb.getRawMany.mockResolvedValue([]);

      const svc = buildService(repo);
      await svc.list({ category: CallTaskCategory.JAMAIS_COMMANDE, page: 2, limit: 10 });

      expect(repo._qb.offset).toHaveBeenCalledWith(10);
      expect(repo._qb.limit).toHaveBeenCalledWith(10);
    });

    it('applique les filtres dateFrom et dateTo', async () => {
      const repo = makeCallTaskRepo();
      repo._qb.getCount.mockResolvedValue(3);
      repo._qb.getRawMany.mockResolvedValue([]);

      const svc = buildService(repo);
      await svc.list({
        category: CallTaskCategory.JAMAIS_COMMANDE,
        dateFrom: '2026-05-01',
        dateTo:   '2026-05-31',
        page:     1,
        limit:    50,
      });

      expect(repo._qb.andWhere).toHaveBeenCalledWith(
        'ct.createdAt >= :dateFrom',
        expect.objectContaining({ dateFrom: expect.any(Date) }),
      );
      expect(repo._qb.andWhere).toHaveBeenCalledWith(
        'ct.createdAt <= :dateTo',
        expect.objectContaining({ dateTo: expect.any(Date) }),
      );
    });
  });
});
