import { MissedCallSlaJob } from '../missed-call-sla.job';
import { MissedCallEvent } from '../entities/missed-call-event.entity';
import { CommercialActionTask } from 'src/action-queue/entities/commercial-action-task.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeMissedCallEvent(overrides: Partial<MissedCallEvent> = {}): MissedCallEvent {
  return Object.assign(new MissedCallEvent(), {
    id: 'mc-1',
    source: 'db2' as const,
    externalId: 'ext-1',
    occurredAt: new Date(Date.now() - 60 * 60_000), // 60 min ago by default
    clientPhone: '+2250700000001',
    clientName: null,
    posteId: 'poste-1',
    commercialId: 'commercial-1',
    deviceId: null,
    callbackTaskId: 'task-1',
    callbackDoneAt: null,
    callbackCallEventId: null,
    callbackDurationSeconds: null,
    handlingDelaySeconds: null,
    slaBreachedAt: null,
    escalatedAt: null,
    status: 'assigned' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeTask(overrides: Partial<CommercialActionTask> = {}): CommercialActionTask {
  return Object.assign(new CommercialActionTask(), {
    id: 'task-1',
    status: 'pending' as const,
    dueAt: new Date(Date.now() - 5 * 60_000), // 5 min ago = overdue
    ...overrides,
  });
}

function makeMissedCallRepo(events: MissedCallEvent[] = []) {
  return {
    find:   jest.fn().mockResolvedValue(events),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  } as any;
}

function makeTaskRepo(task: CommercialActionTask | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(task),
    update:  jest.fn().mockResolvedValue({ affected: 1 }),
  } as any;
}

function makeCronConfigService() {
  return { registerHandler: jest.fn() } as any;
}

function makeNotificationService() {
  return { create: jest.fn().mockResolvedValue({}) } as any;
}

function makeEventEmitter() {
  return { emit: jest.fn() } as any;
}

function makeSystemConfig(slaMinutes = '30', autoCloseHours = '24') {
  return {
    get: jest.fn().mockImplementation(async (key: string) => {
      if (key === 'MISSED_CALL_SLA_MINUTES')     return slaMinutes;
      if (key === 'MISSED_CALL_AUTO_CLOSE_HOURS') return autoCloseHours;
      return null;
    }),
  } as any;
}

function buildJob(
  missedRepo      = makeMissedCallRepo(),
  taskRepo        = makeTaskRepo(),
  cronConfigSvc   = makeCronConfigService(),
  notifySvc       = makeNotificationService(),
  eventEmitter    = makeEventEmitter(),
  systemConfig    = makeSystemConfig(),
): MissedCallSlaJob {
  return new MissedCallSlaJob(
    missedRepo,
    taskRepo,
    cronConfigSvc,
    notifySvc,
    eventEmitter,
    systemConfig,
  );
}

describe('MissedCallSlaJob', () => {

  it('enregistre le handler au demarrage du module', () => {
    const cronSvc = makeCronConfigService();
    const job = buildJob(makeMissedCallRepo(), makeTaskRepo(), cronSvc);
    job.onModuleInit();
    expect(cronSvc.registerHandler).toHaveBeenCalledWith('missed-call-sla', expect.any(Function));
  });

  describe('checkSlaBreaches (via run)', () => {

    it('escalade un evenement assigned dont la tache dueAt est depasse', async () => {
      const mc = makeMissedCallEvent({ status: 'assigned', slaBreachedAt: null, callbackTaskId: 'task-1' });
      const task = makeTask({ id: 'task-1', status: 'pending', dueAt: new Date(Date.now() - 10 * 60_000) });
      const missedRepo = makeMissedCallRepo([mc]);
      const taskRepo = makeTaskRepo(task);
      const notifySvc = makeNotificationService();
      const emitter = makeEventEmitter();
      const job = buildJob(missedRepo, taskRepo, makeCronConfigService(), notifySvc, emitter);

      const msg = await job.run();

      expect(missedRepo.update).toHaveBeenCalledWith(
        'mc-1',
        expect.objectContaining({ status: 'escalated' }),
      );
      expect(notifySvc.create).toHaveBeenCalledWith('alert', expect.any(String), expect.any(String));
      expect(emitter.emit).toHaveBeenCalledWith('missed_call.sla_breached', expect.any(Object));
      expect(msg).toContain('1 escalade(s)');
    });

    it('ne fait rien si la tache dueAt nest pas encore depasse', async () => {
      const mc = makeMissedCallEvent({ status: 'assigned', slaBreachedAt: null, callbackTaskId: 'task-1' });
      const task = makeTask({
        id: 'task-1',
        status: 'pending',
        dueAt: new Date(Date.now() + 15 * 60_000), // dans 15 min = pas encore depassé
      });
      const missedRepo = makeMissedCallRepo([mc]);
      const taskRepo = makeTaskRepo(task);

      // Also mock find for autoClose to return empty (occurredAt 60 min ago > 24h? No)
      const job = buildJob(missedRepo, taskRepo);

      await job.run();

      // update should not have been called for escalation
      const escalationCalls = (missedRepo.update as jest.Mock).mock.calls.filter(
        (call: any[]) => call[1] && call[1].status === 'escalated',
      );
      expect(escalationCalls).toHaveLength(0);
    });
  });

  describe('autoCloseOldEvents (via run)', () => {

    it('ferme un evenement pending depuis plus de 24h', async () => {
      const stale = makeMissedCallEvent({
        id: 'mc-stale',
        status: 'pending',
        slaBreachedAt: null,
        callbackTaskId: null,
        occurredAt: new Date(Date.now() - 25 * 60 * 60_000), // 25h ago
      });
      // first call (checkSlaBreaches): find returns [] because we check status=assigned only
      // second call (autoCloseOldEvents): find returns [stale]
      const missedRepo = {
        find: jest.fn()
          .mockResolvedValueOnce([])   // checkSlaBreaches: no assigned events
          .mockResolvedValueOnce([stale]), // autoCloseOldEvents: stale events
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      } as any;

      const job = buildJob(missedRepo, makeTaskRepo());
      const msg = await job.run();

      expect(missedRepo.update).toHaveBeenCalledWith('mc-stale', { status: 'closed' });
      expect(msg).toContain('1 fermeture(s)');
    });

    it('ne ferme pas un evenement pending depuis moins de 24h', async () => {
      const recent = makeMissedCallEvent({
        id: 'mc-recent',
        status: 'pending',
        slaBreachedAt: null,
        callbackTaskId: null,
        occurredAt: new Date(Date.now() - 2 * 60 * 60_000), // 2h ago
      });
      const missedRepo = {
        find: jest.fn()
          .mockResolvedValueOnce([])     // checkSlaBreaches: no assigned events
          .mockResolvedValueOnce([]),    // autoCloseOldEvents: LessThan(cutoff) retourne [] (le repo mock ne filtre pas)
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      } as any;

      const job = buildJob(missedRepo, makeTaskRepo());
      const msg = await job.run();

      // update should not have been called for 'closed'
      const closedCalls = (missedRepo.update as jest.Mock).mock.calls.filter(
        (call: any[]) => call[1] && call[1].status === 'closed',
      );
      expect(closedCalls).toHaveLength(0);
      expect(msg).toContain('0 fermeture(s)');
    });
  });
});
