import { MissedCallHandlerService, HandleMissedCallParams, OutgoingCallParams } from '../missed-call-handler.service';
import { MissedCallEvent } from '../entities/missed-call-event.entity';

function makeMissedCallEvent(overrides: Partial<MissedCallEvent> = {}): MissedCallEvent {
  return Object.assign(new MissedCallEvent(), {
    id: 'mc-1',
    source: 'db2' as const,
    externalId: 'ext-1',
    occurredAt: new Date('2026-05-12T10:00:00Z'),
    clientPhone: '+2250700000001',
    clientName: null,
    posteId: 'poste-1',
    commercialId: 'commercial-1',
    deviceId: null,
    callbackTaskId: null,
    callbackDoneAt: null,
    callbackCallEventId: null,
    callbackDurationSeconds: null,
    handlingDelaySeconds: null,
    slaBreachedAt: null,
    escalatedAt: null,
    status: 'pending' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeMissedCallRepo(event: MissedCallEvent | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(event),
    create:  jest.fn().mockImplementation((data: Partial<MissedCallEvent>) => Object.assign(new MissedCallEvent(), data)),
    save:    jest.fn().mockImplementation(async (e: MissedCallEvent) => e),
    update:  jest.fn().mockResolvedValue({ affected: 1 }),
  } as any;
}

function makeActionTaskRepo() {
  return { update: jest.fn().mockResolvedValue({ affected: 1 }) } as any;
}

function makeActionQueueService(taskId = 'task-1') {
  return { saveTask: jest.fn().mockResolvedValue({ id: taskId }) } as any;
}

function makeEventEmitter() {
  return { emit: jest.fn() } as any;
}

function makeCallEventRepo() {
  return { find: jest.fn().mockResolvedValue([]) } as any;
}

function makeCommercialRepo() {
  return { find: jest.fn().mockResolvedValue([]) } as any;
}

function makeMessageRepo() {
  const qb: any = {
    innerJoin: jest.fn().mockReturnThis(),
    select:    jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where:     jest.fn().mockReturnThis(),
    andWhere:  jest.fn().mockReturnThis(),
    orderBy:   jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  return { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;
}

function makeChatRepo() {
  return {} as any;
}

function buildService(
  missedRepo     = makeMissedCallRepo(),
  taskRepo       = makeActionTaskRepo(),
  actionSvc      = makeActionQueueService(),
  emitter        = makeEventEmitter(),
  callEventRepo  = makeCallEventRepo(),
  commercialRepo = makeCommercialRepo(),
  messageRepo    = makeMessageRepo(),
  chatRepo       = makeChatRepo(),
): MissedCallHandlerService {
  return new MissedCallHandlerService(
    missedRepo, taskRepo, callEventRepo, commercialRepo,
    messageRepo, chatRepo, actionSvc, emitter,
  );
}

describe('MissedCallHandlerService', () => {

  describe('handle()', () => {

    it('cree un MissedCallEvent et une tache si posteId est fourni', async () => {
      const repo = makeMissedCallRepo(null);
      const actionSvc = makeActionQueueService();
      const svc = buildService(repo, makeActionTaskRepo(), actionSvc);

      const params: HandleMissedCallParams = {
        source: 'db2',
        externalId: 'ext-new',
        clientPhone: '+2250700000001',
        posteId: 'poste-1',
        commercialId: 'commercial-1',
        occurredAt: new Date(),
      };

      await svc.handle(params);

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(actionSvc.saveTask).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ callbackTaskId: 'task-1', status: 'assigned' }),
      );
    });

    it('idempotence : ne cree rien si externalId deja present', async () => {
      const existing = makeMissedCallEvent({ externalId: 'ext-dup', status: 'pending' });
      const repo = makeMissedCallRepo(existing);
      const actionSvc = makeActionQueueService();
      const svc = buildService(repo, makeActionTaskRepo(), actionSvc);

      await svc.handle({
        source: 'db2',
        externalId: 'ext-dup',
        clientPhone: '+2250700000001',
        occurredAt: new Date(),
      });

      expect(repo.save).not.toHaveBeenCalled();
      expect(actionSvc.saveTask).not.toHaveBeenCalled();
    });

    it('ne cree pas de tache si ni posteId ni commercialId', async () => {
      const repo = makeMissedCallRepo(null);
      const actionSvc = makeActionQueueService();
      const svc = buildService(repo, makeActionTaskRepo(), actionSvc);

      await svc.handle({
        source: 'whatsapp',
        externalId: 'ext-no-poste',
        clientPhone: '+2250700000001',
        occurredAt: new Date(),
      });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(actionSvc.saveTask).not.toHaveBeenCalled();
    });
  });

  describe('onOutgoingCallDetected()', () => {

    it('retourne true et cloture le MissedCallEvent si conditions remplies', async () => {
      const mc = makeMissedCallEvent({
        id: 'mc-match',
        clientPhone: '+2250700000001',
        posteId: 'poste-1',
        status: 'assigned',
        occurredAt: new Date('2026-05-12T10:00:00Z'),
        callbackTaskId: 'task-1',
      });
      const repo = makeMissedCallRepo(mc);
      const taskRepo = makeActionTaskRepo();
      const emitter = makeEventEmitter();
      const svc = buildService(repo, taskRepo, makeActionQueueService(), emitter);

      const params: OutgoingCallParams = {
        callEventExternalId: 'call-out-1',
        posteId: 'poste-1',
        commercialId: 'commercial-1',
        clientPhone: '+2250700000001',
        occurredAt: new Date('2026-05-12T10:20:00Z'),
        durationSeconds: 120,
      };

      const result = await svc.onOutgoingCallDetected(params);

      expect(result).toBe(true);
      expect(repo.update).toHaveBeenCalledWith(
        'mc-match',
        expect.objectContaining({ status: 'called_back' }),
      );
      expect(taskRepo.update).toHaveBeenCalledWith('task-1', { status: 'done' });
      expect(emitter.emit).toHaveBeenCalledWith('missed_call.called_back', expect.any(Object));
    });

    it('retourne false si aucun appel en absence correspondant', async () => {
      const repo = makeMissedCallRepo(null);
      const svc = buildService(repo);

      const result = await svc.onOutgoingCallDetected({
        callEventExternalId: 'call-out-2',
        posteId: 'poste-1',
        commercialId: 'commercial-1',
        clientPhone: '+2250700000099',
        occurredAt: new Date(),
        durationSeconds: 60,
      });

      expect(result).toBe(false);
    });

    it('ne met pas a jour la tache si callbackTaskId est null', async () => {
      const mc = makeMissedCallEvent({ id: 'mc-notask', callbackTaskId: null, status: 'assigned' });
      const repo = makeMissedCallRepo(mc);
      const taskRepo = makeActionTaskRepo();
      const svc = buildService(repo, taskRepo);

      const result = await svc.onOutgoingCallDetected({
        callEventExternalId: 'call-out-3',
        posteId: 'poste-1',
        commercialId: 'commercial-1',
        clientPhone: '+2250700000001',
        occurredAt: new Date('2026-05-12T10:30:00Z'),
        durationSeconds: 45,
      });

      expect(result).toBe(true);
      expect(taskRepo.update).not.toHaveBeenCalled();
    });
  });
});
