/**
 * Flux de test complet — Rotation des conversations (fenêtre glissante)
 *
 * Couvre les 5 étapes du cycle de rotation :
 *   Phase 1 — Construction de la fenêtre (buildWindowForPoste)
 *   Phase 2 — Vérification rotation (checkAndTriggerRotation)
 *   Phase 3 — Blocages obligations / qualité
 *   Phase 4 — Exécution rotation (performRotation / _executeRotation)
 *   Phase 5 — Cas limites et concurrence
 */

import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  WhatsappChat,
  WindowStatus,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import {
  WindowRotationService,
  WINDOW_REPORT_SUBMITTED_EVENT,
  WINDOW_ROTATED_EVENT,
  WINDOW_ROTATION_BLOCKED_EVENT,
} from '../services/window-rotation.service';

// ─── Factories ────────────────────────────────────────────────────────────────

let _uid = 0;
function uid() {
  return `id-${++_uid}`;
}

function makeChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  const id = uid();
  return Object.assign(new WhatsappChat(), {
    id,
    chat_id: `chat-${id}`,
    poste_id: 'poste-1',
    window_slot: null,
    window_status: null,
    status: WhatsappChatStatus.ACTIF,
    is_locked: false,
    is_priority: false,
    deletedAt: null,
    last_activity_at: new Date(),
    last_client_message_at: null,
    last_poste_message_at: null,
    ...overrides,
  });
}

function makeActiveChat(slot: number, overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return makeChat({ window_slot: slot, window_status: WindowStatus.ACTIVE, ...overrides });
}

function makeLockedChat(slot: number, overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return makeChat({ window_slot: slot, window_status: WindowStatus.LOCKED, is_locked: true, ...overrides });
}

function makeReleasedChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return makeChat({ window_slot: null, window_status: WindowStatus.RELEASED, ...overrides });
}

// ─── Mock factories ──────────────────────────────────────────────────────────

function makeQb(results: WhatsappChat[] = []) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
    getMany: jest.fn().mockResolvedValue(results),
    getCount: jest.fn().mockResolvedValue(results.length),
    getRawMany: jest.fn().mockResolvedValue([{ posteId: 'poste-1' }]),
  };
}

function makeChatRepo(defaultChats: WhatsappChat[] = []) {
  const qb = makeQb(defaultChats);
  return {
    find: jest.fn().mockResolvedValue(defaultChats),
    findOne: jest.fn().mockResolvedValue(defaultChats[0] ?? null),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(defaultChats.length),
    query: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    _qb: qb,
  } as any;
}

function makeCapacityService(
  quotaActive = 10,
  quotaTotal = 50,
  windowModeEnabled = true,
) {
  return {
    getQuotas: jest.fn().mockResolvedValue({ quotaActive, quotaTotal }),
    isWindowModeEnabled: jest.fn().mockResolvedValue(windowModeEnabled),
    getValidationThreshold: jest.fn().mockResolvedValue(0),
    onConversationQualifiedLegacy: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeValidationEngine() {
  return {
    initConversationValidation: jest.fn().mockResolvedValue(undefined),
    initConversationValidationBulk: jest.fn().mockResolvedValue(undefined),
    onConversationResultSet: jest.fn().mockResolvedValue(true),
    getBlockProgress: jest.fn().mockResolvedValue({ submitted: 0, total: 10 }),
  } as any;
}

function makeReportService(submittedChatIds: string[] = []) {
  const submitted = new Set(submittedChatIds);
  return {
    getSubmittedMapBulk: jest.fn().mockImplementation((chatIds: string[]) =>
      Promise.resolve(new Map(chatIds.map((id) => [id, submitted.has(id)]))),
    ),
    resetSubmissionBulk: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeLockService(acquired = true) {
  return {
    tryWithLock: jest.fn().mockImplementation(
      async (_resource: string, _ttl: number, fn: () => Promise<unknown>) => {
        if (!acquired) return { acquired: false, result: undefined };
        const result = await fn();
        return { acquired: true, result };
      },
    ),
  } as any;
}

function makeEventEmitter(): jest.Mocked<EventEmitter2> {
  return { emit: jest.fn() } as any;
}

function makeObligationService(opts: {
  enabled?: boolean;
  readyForRotation?: boolean;
  qualityOk?: boolean;
  annuleeDone?: number;
  livreeDone?: number;
  sansCommandeDone?: number;
} = {}) {
  const {
    enabled = true,
    readyForRotation = true,
    qualityOk = true,
    annuleeDone = 5,
    livreeDone = 5,
    sansCommandeDone = 5,
  } = opts;
  return {
    isEnabled: jest.fn().mockResolvedValue(enabled),
    getStatus: jest.fn().mockResolvedValue({
      readyForRotation,
      qualityCheckPassed: qualityOk,
      annulee:      { done: annuleeDone,      required: 5 },
      livree:       { done: livreeDone,       required: 5 },
      sansCommande: { done: sansCommandeDone, required: 5 },
    }),
    checkAndRecordQuality: jest.fn().mockResolvedValue(qualityOk),
    getOrCreateActiveBatch: jest.fn().mockResolvedValue({ id: 'batch-1' }),
  } as any;
}

// ─── Constructeur du service ─────────────────────────────────────────────────

function buildService(
  chatRepo: any,
  opts: {
    quotaActive?: number;
    quotaTotal?: number;
    windowModeEnabled?: boolean;
    obligationService?: any;
    submittedChatIds?: string[];
    reportService?: any;
    lockAcquired?: boolean;
  } = {},
) {
  const emitter   = makeEventEmitter();
  const reportSvc = opts.reportService ?? makeReportService(opts.submittedChatIds ?? []);
  const lockSvc   = makeLockService(opts.lockAcquired ?? true);
  const service   = new WindowRotationService(
    chatRepo,
    makeCapacityService(
      opts.quotaActive ?? 10,
      opts.quotaTotal  ?? 50,
      opts.windowModeEnabled ?? true,
    ),
    makeValidationEngine(),
    emitter,
    reportSvc,
    lockSvc,
    opts.obligationService,
  );
  return { service, emitter, reportSvc, lockSvc };
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function emittedEvent(emitter: jest.Mocked<EventEmitter2>, eventName: string) {
  return (emitter.emit as jest.Mock).mock.calls.find(([e]) => e === eventName);
}

// =============================================================================
// PHASE 1 — Construction de la fenêtre (buildWindowForPoste)
// =============================================================================

describe('Phase 1 — buildWindowForPoste', () => {
  beforeEach(() => { _uid = 0; });

  it('P1-01 : ignore si le mode fenêtre est désactivé', async () => {
    const repo = makeChatRepo();
    const { service } = buildService(repo, { windowModeEnabled: false });

    await service.buildWindowForPoste('poste-1');

    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('P1-02 : assigne les slots 1-10 ACTIVE et 11-50 LOCKED pour un poste vide', async () => {
    const candidates = Array.from({ length: 50 }, (_, i) => makeChat({ poste_id: 'poste-1' }));
    const qb = makeQb([]);
    const repo = makeChatRepo([]);
    // Premier QBuilder = slottedChats (vide), deuxième = unslotted (50 convs)
    repo.createQueryBuilder
      .mockReturnValueOnce({ ...qb, getMany: jest.fn().mockResolvedValue([]) }) // slotted
      .mockReturnValue({ ...qb, getMany: jest.fn().mockResolvedValue(candidates) }); // unslotted

    const checkSpy = jest.spyOn((buildService(repo)).service, 'checkAndTriggerRotation').mockResolvedValue(undefined);
    // On doit reconstruire pour récupérer le bon service
    const repo2 = makeChatRepo([]);
    repo2.createQueryBuilder
      .mockReturnValueOnce({ ...makeQb([]), getMany: jest.fn().mockResolvedValue([]) })
      .mockReturnValue({ ...makeQb(candidates), getMany: jest.fn().mockResolvedValue(candidates) });
    const { service } = buildService(repo2, { quotaActive: 10, quotaTotal: 50 });
    jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

    await service.buildWindowForPoste('poste-1');

    // 50 update() appelés pour les 50 slots
    expect(repo2.update).toHaveBeenCalledTimes(50);
    // Les 10 premiers slots doivent avoir window_status ACTIVE
    const activeCalls = (repo2.update as jest.Mock).mock.calls.filter(
      ([, data]) => data.window_status === WindowStatus.ACTIVE,
    );
    expect(activeCalls).toHaveLength(10);
    // Les 40 suivants doivent être LOCKED
    const lockedCalls = (repo2.update as jest.Mock).mock.calls.filter(
      ([, data]) => data.window_status === WindowStatus.LOCKED,
    );
    expect(lockedCalls).toHaveLength(40);
  });

  it('P1-03 : ne réassigne pas si la fenêtre est déjà complète (50 slots)', async () => {
    const slotted = Array.from({ length: 50 }, (_, i) =>
      makeActiveChat(i + 1),
    );
    const qb = { ...makeQb(slotted), getMany: jest.fn().mockResolvedValue(slotted) };
    const repo = makeChatRepo(slotted);
    repo.createQueryBuilder.mockReturnValue(qb);
    const { service } = buildService(repo, { quotaTotal: 50 });
    jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

    await service.buildWindowForPoste('poste-1');

    // Pas de mise à jour de slots si la fenêtre est déjà complète
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('P1-04 : inclut les FERMÉ sans rapport quand pas assez de candidats actifs', async () => {
    const activeCandidates = Array.from({ length: 5 }, () =>
      makeChat({ status: WhatsappChatStatus.ACTIF }),
    );
    const fermeNoReport = Array.from({ length: 5 }, () =>
      makeChat({ status: WhatsappChatStatus.FERME }),
    );
    const qb = makeQb([]);
    const repo = makeChatRepo([]);
    // slotted: vide, unslotted: 5 actifs, ferme: 5 sans rapport
    repo.createQueryBuilder
      .mockReturnValueOnce({ ...qb, getMany: jest.fn().mockResolvedValue([]) })         // slotted
      .mockReturnValueOnce({ ...qb, getMany: jest.fn().mockResolvedValue(activeCandidates) }) // unslotted
      .mockReturnValue({ ...qb, getMany: jest.fn().mockResolvedValue(fermeNoReport) }); // ferme

    const reportSvc = makeReportService([]); // aucun rapport soumis
    const { service } = buildService(repo, { quotaActive: 10, quotaTotal: 50, reportService: reportSvc });
    jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

    await service.buildWindowForPoste('poste-1');

    // Doit avoir pris les 5 actifs + 5 FERMÉ sans rapport = 10 slots
    expect(repo.update).toHaveBeenCalledTimes(10);
  });

  it('P1-05 : exclut les FERMÉ avec rapport déjà soumis lors du build', async () => {
    const activeCandidates = Array.from({ length: 3 }, () =>
      makeChat({ status: WhatsappChatStatus.ACTIF }),
    );
    const fermeWithReport = Array.from({ length: 7 }, () =>
      makeChat({ status: WhatsappChatStatus.FERME }),
    );
    const qb = makeQb([]);
    const repo = makeChatRepo([]);
    repo.createQueryBuilder
      .mockReturnValueOnce({ ...qb, getMany: jest.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ ...qb, getMany: jest.fn().mockResolvedValue(activeCandidates) })
      .mockReturnValue({ ...qb, getMany: jest.fn().mockResolvedValue(fermeWithReport) });

    // Tous les FERMÉ ont un rapport soumis
    const reportSvc = makeReportService(fermeWithReport.map((c) => c.chat_id));
    const { service } = buildService(repo, { quotaActive: 10, quotaTotal: 50, reportService: reportSvc });
    jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

    await service.buildWindowForPoste('poste-1');

    // Seulement les 3 actifs, les FERMÉ avec rapport sont exclus
    expect(repo.update).toHaveBeenCalledTimes(3);
  });

  it('P1-06 : réinitialise les soumissions des nouvelles entrées non-FERMÉ', async () => {
    const newChats = Array.from({ length: 5 }, () =>
      makeChat({ status: WhatsappChatStatus.ACTIF }),
    );
    const qb = makeQb([]);
    const repo = makeChatRepo([]);
    repo.createQueryBuilder
      .mockReturnValueOnce({ ...qb, getMany: jest.fn().mockResolvedValue([]) })
      .mockReturnValue({ ...qb, getMany: jest.fn().mockResolvedValue(newChats) });

    const reportSvc = makeReportService([]);
    const { service } = buildService(repo, { reportService: reportSvc });
    jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

    await service.buildWindowForPoste('poste-1');

    expect(reportSvc.resetSubmissionBulk).toHaveBeenCalledWith(
      expect.arrayContaining(newChats.map((c) => c.chat_id)),
    );
  });

  it('P1-07 : appelle checkAndTriggerRotation après la construction', async () => {
    const qb = makeQb([]);
    const repo = makeChatRepo([]);
    repo.createQueryBuilder.mockReturnValue({ ...qb, getMany: jest.fn().mockResolvedValue([]) });
    const { service } = buildService(repo);
    const checkSpy = jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

    await service.buildWindowForPoste('poste-1');

    expect(checkSpy).toHaveBeenCalledWith('poste-1');
  });

  it('P1-08 : crée un batch obligations si le service est activé', async () => {
    const obligSvc = makeObligationService({ enabled: true });
    const qb = makeQb([]);
    const repo = makeChatRepo([]);
    repo.createQueryBuilder.mockReturnValue({ ...qb, getMany: jest.fn().mockResolvedValue([]) });
    const { service } = buildService(repo, { obligationService: obligSvc });
    jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

    await service.buildWindowForPoste('poste-1');

    expect(obligSvc.getOrCreateActiveBatch).toHaveBeenCalledWith('poste-1');
  });
});

// =============================================================================
// PHASE 2 — Vérification de la rotation (checkAndTriggerRotation)
// =============================================================================

describe('Phase 2 — checkAndTriggerRotation', () => {
  beforeEach(() => { _uid = 0; });

  it('P2-01 : ne se déclenche pas si aucune conversation active', async () => {
    const repo = makeChatRepo([]);
    const { service } = buildService(repo);
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(performSpy).not.toHaveBeenCalled();
  });

  it('P2-02 : ne se déclenche pas si 0 rapport soumis sur 10 conversations', async () => {
    const chats = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const repo = makeChatRepo(chats);
    const { service } = buildService(repo, { submittedChatIds: [] });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(performSpy).not.toHaveBeenCalled();
  });

  it('P2-03 : ne se déclenche pas si 9/10 rapports soumis', async () => {
    const chats = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const submittedIds = chats.slice(0, 9).map((c) => c.chat_id);
    const repo = makeChatRepo(chats);
    const { service } = buildService(repo, { quotaActive: 10, submittedChatIds: submittedIds });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(performSpy).not.toHaveBeenCalled();
  });

  it('P2-04 : se déclenche quand exactement 10/10 rapports sont soumis', async () => {
    const chats = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const repo = makeChatRepo(chats);
    const { service } = buildService(repo, { quotaActive: 10, submittedChatIds: chats.map((c) => c.chat_id) });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(performSpy).toHaveBeenCalledWith('poste-1');
  });

  it('P2-05 : seuil adapté si le poste a moins de 10 conversations (ex: 5/5)', async () => {
    const chats = Array.from({ length: 5 }, (_, i) => makeActiveChat(i + 1));
    const repo = makeChatRepo(chats);
    const { service } = buildService(repo, { quotaActive: 10, submittedChatIds: chats.map((c) => c.chat_id) });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    // 5 conversations sur 5 avec rapports → seuil = 5 → rotation déclenchée
    expect(performSpy).toHaveBeenCalledWith('poste-1');
  });

  it('P2-06 : ignore si une rotation est déjà en cours (guard in-process)', async () => {
    const chats = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const repo = makeChatRepo(chats);
    const { service } = buildService(repo, { submittedChatIds: chats.map((c) => c.chat_id) });
    // Simuler rotation en cours via le set privé
    (service as any).rotatingPostes.add('poste-1');
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(performSpy).not.toHaveBeenCalled();
  });

  it('P2-07 : déclenche si le mode est activé et que les conversations FERMÉ ont leurs rapports soumis', async () => {
    const chats = Array.from({ length: 10 }, (_, i) =>
      makeActiveChat(i + 1, { status: WhatsappChatStatus.FERME }),
    );
    const repo = makeChatRepo(chats);
    const { service } = buildService(repo, { quotaActive: 10, submittedChatIds: chats.map((c) => c.chat_id) });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(performSpy).toHaveBeenCalledWith('poste-1');
  });

  it('P2-08 : ne fait rien si le mode fenêtre est désactivé', async () => {
    const chats = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const repo = makeChatRepo(chats);
    const { service } = buildService(repo, { windowModeEnabled: false, submittedChatIds: chats.map((c) => c.chat_id) });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(performSpy).not.toHaveBeenCalled();
  });
});

// =============================================================================
// PHASE 3 — Obligations d'appels et blocages
// =============================================================================

describe('Phase 3 — Obligations et blocages rotation', () => {
  beforeEach(() => { _uid = 0; });

  function makeFullActiveBlock() {
    return Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
  }

  it('P3-01 : rotation sans vérification des obligations si le service est désactivé', async () => {
    const chats = makeFullActiveBlock();
    const repo = makeChatRepo(chats);
    const obligSvc = makeObligationService({ enabled: false });
    const { service } = buildService(repo, {
      quotaActive: 10,
      obligationService: obligSvc,
      submittedChatIds: chats.map((c) => c.chat_id),
    });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(obligSvc.getStatus).not.toHaveBeenCalled();
    expect(performSpy).toHaveBeenCalledWith('poste-1');
  });

  it('P3-02 : blocage si les appels sont incomplets (8/15) — émet ROTATION_BLOCKED avec raison call_obligations_incomplete', async () => {
    const chats = makeFullActiveBlock();
    const repo = makeChatRepo(chats);
    const obligSvc = makeObligationService({
      enabled: true,
      readyForRotation: false,
      qualityOk: false,
      annuleeDone: 3,
      livreeDone: 3,
      sansCommandeDone: 2,
    });
    const { service, emitter } = buildService(repo, {
      quotaActive: 10,
      obligationService: obligSvc,
      submittedChatIds: chats.map((c) => c.chat_id),
    });
    jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    const blocked = emittedEvent(emitter, WINDOW_ROTATION_BLOCKED_EVENT);
    expect(blocked).toBeDefined();
    expect(blocked![1].reason).toBe('call_obligations_incomplete');
    expect(blocked![1].posteId).toBe('poste-1');
  });

  it('P3-03 : blocage si appels complets mais qualité KO — émet ROTATION_BLOCKED avec raison quality_check_failed', async () => {
    const chats = makeFullActiveBlock();
    const repo = makeChatRepo(chats);
    // 15/15 appels mais qualité KO (getStatus.readyForRotation=false + qualityOk=false)
    const obligSvc = makeObligationService({
      enabled: true,
      readyForRotation: false,
      qualityOk: false,
      annuleeDone: 5,
      livreeDone: 5,
      sansCommandeDone: 5,
    });
    const { service, emitter } = buildService(repo, {
      quotaActive: 10,
      obligationService: obligSvc,
      submittedChatIds: chats.map((c) => c.chat_id),
    });
    jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    const blocked = emittedEvent(emitter, WINDOW_ROTATION_BLOCKED_EVENT);
    expect(blocked).toBeDefined();
    expect(blocked![1].reason).toBe('quality_check_failed');
  });

  it('P3-04 : rotation autorisée si appels complets et qualité OK', async () => {
    const chats = makeFullActiveBlock();
    const repo = makeChatRepo(chats);
    const obligSvc = makeObligationService({ enabled: true, readyForRotation: true, qualityOk: true });
    const { service, emitter } = buildService(repo, {
      quotaActive: 10,
      obligationService: obligSvc,
      submittedChatIds: chats.map((c) => c.chat_id),
    });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(performSpy).toHaveBeenCalledWith('poste-1');
    expect(emittedEvent(emitter, WINDOW_ROTATION_BLOCKED_EVENT)).toBeUndefined();
  });

  it('P3-05 : checkAndRecordQuality appelé SEULEMENT si les appels sont complets (OBL-003)', async () => {
    const chats = makeFullActiveBlock();
    const repo = makeChatRepo(chats);
    // 8/15 appels — incomplet
    const obligSvc = makeObligationService({
      enabled: true,
      readyForRotation: false,
      qualityOk: false,
      annuleeDone: 3,
      livreeDone: 3,
      sansCommandeDone: 2,
    });
    const { service } = buildService(repo, {
      quotaActive: 10,
      obligationService: obligSvc,
      submittedChatIds: chats.map((c) => c.chat_id),
    });
    jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(obligSvc.checkAndRecordQuality).not.toHaveBeenCalled();
  });

  it('P3-06 : getStatus appelé 2 fois si appels complets (avant et après qualité — OBL-003)', async () => {
    const chats = makeFullActiveBlock();
    const repo = makeChatRepo(chats);
    const obligSvc = makeObligationService({ enabled: true, readyForRotation: true, qualityOk: true });
    const { service } = buildService(repo, {
      quotaActive: 10,
      obligationService: obligSvc,
      submittedChatIds: chats.map((c) => c.chat_id),
    });
    jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(obligSvc.getStatus).toHaveBeenCalledTimes(2);
    // La qualité est vérifiée entre les deux lectures
    const qualityOrder = (obligSvc.checkAndRecordQuality as jest.Mock).mock.invocationCallOrder[0];
    const secondStatusOrder = (obligSvc.getStatus as jest.Mock).mock.invocationCallOrder[1];
    expect(qualityOrder).toBeLessThan(secondStatusOrder);
  });

  it('P3-07 : les obligations ne sont pas vérifiées si les rapports sont incomplets', async () => {
    const chats = makeFullActiveBlock();
    const repo = makeChatRepo(chats);
    const obligSvc = makeObligationService({ enabled: true });
    const { service } = buildService(repo, {
      quotaActive: 10,
      obligationService: obligSvc,
      submittedChatIds: [], // 0 rapports
    });

    await service.checkAndTriggerRotation('poste-1');

    expect(obligSvc.getStatus).not.toHaveBeenCalled();
    expect(obligSvc.checkAndRecordQuality).not.toHaveBeenCalled();
  });

  it('P3-08 : le payload du blocage contient la progression des appels', async () => {
    const chats = makeFullActiveBlock();
    const repo = makeChatRepo(chats);
    const obligSvc = makeObligationService({
      enabled: true,
      readyForRotation: false,
      qualityOk: false,
      annuleeDone: 2,
      livreeDone: 1,
      sansCommandeDone: 0,
    });
    const { service, emitter } = buildService(repo, {
      quotaActive: 10,
      obligationService: obligSvc,
      submittedChatIds: chats.map((c) => c.chat_id),
    });
    jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    const blocked = emittedEvent(emitter, WINDOW_ROTATION_BLOCKED_EVENT);
    expect(blocked![1].progress).toEqual({ submitted: 3, total: 15 });
  });
});

// =============================================================================
// PHASE 4 — Exécution de la rotation (performRotation / _executeRotation)
// =============================================================================

describe('Phase 4 — performRotation', () => {
  beforeEach(() => { _uid = 0; });

  it('P4-01 : libère les conversations ACTIVE dont le rapport est soumis', async () => {
    const submitted = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const allIds = submitted.map((c) => c.chat_id);
    const reportSvc = makeReportService(allIds);
    const repo = makeChatRepo(submitted);
    repo.find
      .mockResolvedValueOnce(submitted)  // bloc actif
      .mockResolvedValueOnce([])         // remaining après batchRelease
      .mockResolvedValue([]);            // candidats injection

    const { service, emitter } = buildService(repo, { quotaActive: 10, reportService: reportSvc });

    await service.performRotation('poste-1');

    const rotatedCall = emittedEvent(emitter, WINDOW_ROTATED_EVENT);
    expect(rotatedCall![1].releasedChatIds).toEqual(expect.arrayContaining(allIds));
  });

  it('P4-02 : promet les conversations LOCKED en ACTIVE après libération', async () => {
    const activeSubmitted = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const locked          = Array.from({ length: 10 }, (_, i) => makeLockedChat(i + 11));
    const allSubmittedIds = activeSubmitted.map((c) => c.chat_id);
    const reportSvc       = makeReportService(allSubmittedIds);
    const repo            = makeChatRepo([...activeSubmitted, ...locked]);

    repo.find
      .mockResolvedValueOnce(activeSubmitted) // bloc actif
      .mockResolvedValueOnce(locked)          // remaining LOCKED
      .mockResolvedValue([]);                 // candidats injection

    const { service, emitter } = buildService(repo, { quotaActive: 10, reportService: reportSvc });

    await service.performRotation('poste-1');

    const rotatedCall = emittedEvent(emitter, WINDOW_ROTATED_EVENT);
    expect(rotatedCall![1].promotedChatIds).toEqual(expect.arrayContaining(locked.map((c) => c.chat_id)));
  });

  it('P4-03 : injecte de nouvelles conversations dans les slots libérés', async () => {
    const submitted = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const newChats  = Array.from({ length: 10 }, () => makeChat({ status: WhatsappChatStatus.ACTIF }));
    const reportSvc = makeReportService(submitted.map((c) => c.chat_id));
    const repo      = makeChatRepo([...submitted]);
    const qbNew     = { ...makeQb(newChats), getMany: jest.fn().mockResolvedValue(newChats) };

    repo.find
      .mockResolvedValueOnce(submitted)  // bloc actif
      .mockResolvedValueOnce([]);        // remaining (tout libéré)
    repo.createQueryBuilder.mockReturnValue(qbNew); // candidats injection

    const { service } = buildService(repo, { quotaActive: 10, reportService: reportSvc });

    const result = await service.performRotation('poste-1');

    // Les nouvelles conversations ne doivent pas être dans les releasedChatIds
    const releasedSet = new Set(result.releasedChatIds);
    for (const chat of newChats) {
      expect(releasedSet.has(chat.chat_id)).toBe(false);
    }
  });

  it('P4-04 : les conversations libérées ne réapparaissent pas dans les promues', async () => {
    const submitted = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const reportSvc = makeReportService(submitted.map((c) => c.chat_id));
    const repo      = makeChatRepo(submitted);
    repo.find
      .mockResolvedValueOnce(submitted)
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);

    const { service } = buildService(repo, { quotaActive: 10, reportService: reportSvc });

    const result = await service.performRotation('poste-1');

    const releasedSet = new Set(result.releasedChatIds);
    for (const chatId of result.promotedChatIds) {
      expect(releasedSet.has(chatId)).toBe(false);
    }
  });

  it('P4-05 : émet WINDOW_ROTATED avec les listes exactes released et promoted', async () => {
    const submitted = Array.from({ length: 5 }, (_, i) => makeActiveChat(i + 1));
    const notSubmitted = Array.from({ length: 5 }, (_, i) => makeLockedChat(i + 6));
    const allActive = [...submitted, ...notSubmitted];
    const reportSvc = makeReportService(submitted.map((c) => c.chat_id));
    const repo      = makeChatRepo(allActive);

    repo.find
      .mockResolvedValueOnce(allActive)    // bloc actif
      .mockResolvedValueOnce(notSubmitted) // remaining
      .mockResolvedValue([]);              // injection

    const { service, emitter } = buildService(repo, { quotaActive: 10, reportService: reportSvc });

    await service.performRotation('poste-1');

    const rotatedCall = emittedEvent(emitter, WINDOW_ROTATED_EVENT);
    expect(rotatedCall![1].posteId).toBe('poste-1');
    expect(rotatedCall![1].releasedChatIds).toHaveLength(5);
  });

  it('P4-06 : crée un nouveau batch obligations après rotation (non bloquant)', async () => {
    const submitted = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const reportSvc = makeReportService(submitted.map((c) => c.chat_id));
    const obligSvc  = makeObligationService({ enabled: true });
    const repo      = makeChatRepo(submitted);
    repo.find
      .mockResolvedValueOnce(submitted)
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);

    const { service } = buildService(repo, {
      quotaActive: 10,
      reportService: reportSvc,
      obligationService: obligSvc,
    });

    await service.performRotation('poste-1');

    expect(obligSvc.getOrCreateActiveBatch).toHaveBeenCalledWith('poste-1');
  });

  it('P4-07 : réinitialise les soumissions des promues et injectées', async () => {
    const submitted = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const locked    = Array.from({ length: 5 }, (_, i) => makeLockedChat(i + 11));
    const reportSvc = makeReportService(submitted.map((c) => c.chat_id));
    const repo      = makeChatRepo([...submitted, ...locked]);
    repo.find
      .mockResolvedValueOnce(submitted)
      .mockResolvedValueOnce(locked)
      .mockResolvedValue([]);

    const { service } = buildService(repo, { quotaActive: 10, reportService: reportSvc });

    await service.performRotation('poste-1');

    expect(reportSvc.resetSubmissionBulk).toHaveBeenCalledWith(
      expect.arrayContaining(locked.map((c) => c.chat_id)),
    );
  });

  it('P4-08 : skip si lock non acquis (rotation en cours sur autre instance)', async () => {
    const chats = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const repo  = makeChatRepo(chats);
    const { service, emitter } = buildService(repo, { lockAcquired: false });

    const result = await service.performRotation('poste-1');

    expect(result.releasedChatIds).toHaveLength(0);
    expect(result.promotedChatIds).toHaveLength(0);
    expect(emittedEvent(emitter, WINDOW_ROTATED_EVENT)).toBeUndefined();
  });

  it('P4-09 : n\'injecte pas les FERMÉ dont le rapport est déjà soumis', async () => {
    const activeSubmitted = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const fermeWithReport = Array.from({ length: 5 }, () =>
      makeChat({ status: WhatsappChatStatus.FERME, window_status: null }),
    );
    const reportSvc = makeReportService([
      ...activeSubmitted.map((c) => c.chat_id),
      ...fermeWithReport.map((c) => c.chat_id),
    ]);
    const repo = makeChatRepo(activeSubmitted);
    const qbCandidates = {
      ...makeQb(fermeWithReport),
      getMany: jest.fn().mockResolvedValue(fermeWithReport),
    };

    repo.find
      .mockResolvedValueOnce(activeSubmitted)
      .mockResolvedValueOnce([]);
    repo.createQueryBuilder.mockReturnValue(qbCandidates);

    const { service, emitter } = buildService(repo, { quotaActive: 10, reportService: reportSvc });

    await service.performRotation('poste-1');

    const rotated = emittedEvent(emitter, WINDOW_ROTATED_EVENT);
    // Les FERMÉ avec rapport ne doivent pas être injectés
    const allReleasedAndPromoted = [
      ...rotated![1].releasedChatIds,
      ...rotated![1].promotedChatIds,
    ];
    for (const ferme of fermeWithReport) {
      expect(allReleasedAndPromoted).not.toContain(ferme.chat_id);
    }
  });
});

// =============================================================================
// PHASE 5 — Événements et handlers
// =============================================================================

describe('Phase 5 — Handlers et événements', () => {
  beforeEach(() => { _uid = 0; });

  describe('handleConversationResultSet', () => {
    it('H-01 : émet WINDOW_REPORT_SUBMITTED_EVENT avec chatId et posteId', async () => {
      const chat = makeActiveChat(1);
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service, emitter } = buildService(repo);
      jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

      await service.handleConversationResultSet({ chatId: chat.chat_id, posteId: 'poste-1' });

      const evt = emittedEvent(emitter, WINDOW_REPORT_SUBMITTED_EVENT);
      expect(evt).toBeDefined();
      expect(evt![1]).toMatchObject({ chatId: chat.chat_id, posteId: 'poste-1' });
    });

    it('H-02 : ne fait rien si posteId est null', async () => {
      const repo = makeChatRepo([]);
      const { service, emitter } = buildService(repo);

      await service.handleConversationResultSet({ chatId: 'chat-1', posteId: null });

      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('H-03 : déclenche checkAndTriggerRotation après le rapport', async () => {
      const chat = makeActiveChat(1);
      const repo = makeChatRepo([chat]);
      repo.findOne
        .mockResolvedValueOnce(chat)   // isWindowModeEnabled → findOne
        .mockResolvedValue(chat);
      const { service } = buildService(repo);
      const checkSpy = jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);
      const buildSpy = jest.spyOn(service, 'buildWindowForPoste').mockResolvedValue(undefined);

      await service.handleConversationResultSet({ chatId: chat.chat_id, posteId: 'poste-1' });

      expect(checkSpy).toHaveBeenCalledWith('poste-1');
    });
  });

  describe('handleConversationStatusChanged', () => {
    it('H-04 : ignore si le statut n\'est pas "fermé"', async () => {
      const repo = makeChatRepo([]);
      const { service } = buildService(repo);

      await service.handleConversationStatusChanged({ chatId: 'chat-1', newStatus: 'actif' });

      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('H-05 : appelle checkAndTriggerRotation quand une conversation est fermée avec un slot', async () => {
      const chat = makeActiveChat(3);
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo);
      const checkSpy = jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

      await service.handleConversationStatusChanged({ chatId: chat.chat_id, newStatus: 'fermé' });

      expect(checkSpy).toHaveBeenCalledWith(chat.poste_id);
    });

    it('H-06 : ne libère PAS immédiatement la conversation fermée (elle conserve son slot)', async () => {
      const chat = makeActiveChat(3, { status: WhatsappChatStatus.FERME });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo);
      jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

      await service.handleConversationStatusChanged({ chatId: chat.chat_id, newStatus: 'fermé' });

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('H-07 : ignore si la conversation n\'a pas de slot', async () => {
      const chat = makeChat({ window_slot: null, window_status: null });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo);
      const checkSpy = jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

      await service.handleConversationStatusChanged({ chatId: chat.chat_id, newStatus: 'fermé' });

      expect(checkSpy).not.toHaveBeenCalled();
    });
  });

  describe('autoCheckRotations', () => {
    it('H-08 : vérifie la rotation pour tous les postes avec une fenêtre ouverte', async () => {
      const repo = makeChatRepo([]);
      const { service } = buildService(repo);
      const checkSpy = jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

      await service.autoCheckRotations();

      expect(checkSpy).toHaveBeenCalledWith('poste-1');
    });

    it('H-09 : initialise la fenêtre des postes sans window_slot (rattrapage)', async () => {
      const slottedQb  = { ...makeQb([]), getRawMany: jest.fn().mockResolvedValue([]) };
      const uninitQb   = { ...makeQb([]), getRawMany: jest.fn().mockResolvedValue([{ posteId: 'poste-2' }]) };
      const repo = makeChatRepo([]);
      repo.createQueryBuilder
        .mockReturnValueOnce(slottedQb)
        .mockReturnValue(uninitQb);

      const { service } = buildService(repo);
      jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);
      const buildSpy = jest.spyOn(service, 'buildWindowForPoste').mockResolvedValue(undefined);

      await service.autoCheckRotations();

      expect(buildSpy).toHaveBeenCalledWith('poste-2');
    });

    it('H-10 : ne build pas la fenêtre si le mode est désactivé', async () => {
      const repo = makeChatRepo([]);
      const { service } = buildService(repo, { windowModeEnabled: false });
      const buildSpy = jest.spyOn(service, 'buildWindowForPoste').mockResolvedValue(undefined);
      const checkSpy = jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

      await service.autoCheckRotations();

      expect(buildSpy).not.toHaveBeenCalled();
      expect(checkSpy).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// PHASE 6 — Scénario de rotation bout en bout (cas réaliste)
// =============================================================================

describe('Phase 6 — Scénario bout en bout', () => {
  beforeEach(() => { _uid = 0; });

  /**
   * Scénario complet :
   * - Poste avec 50 conversations (10 ACTIVE slots 1-10, 40 LOCKED slots 11-50)
   * - 10 rapports soumis pour les ACTIVE
   * - Obligations complètes (5+5+5) et qualité OK
   * - Rotation : libère les 10 ACTIVE, promeut 10 LOCKED, injecte 10 nouvelles
   */
  it('E2E-01 : rotation complète avec obligations — libère 10, promet 10, injecte 10', async () => {
    const activeChats  = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const lockedChats  = Array.from({ length: 40 }, (_, i) => makeLockedChat(i + 11));
    const newCandidates = Array.from({ length: 10 }, () => makeChat({ status: WhatsappChatStatus.ACTIF }));

    const reportSvc = makeReportService(activeChats.map((c) => c.chat_id));
    const obligSvc  = makeObligationService({ enabled: true, readyForRotation: true, qualityOk: true });

    const repo = makeChatRepo([...activeChats, ...lockedChats]);
    const qbCandidates = { ...makeQb(newCandidates), getMany: jest.fn().mockResolvedValue(newCandidates) };

    // Séquence find() pour performRotation:
    // 1. bloc actif (10 ACTIVE)
    // 2. remaining après batchRelease (40 LOCKED)
    repo.find
      .mockResolvedValueOnce(activeChats)
      .mockResolvedValueOnce(lockedChats);
    repo.createQueryBuilder.mockReturnValue(qbCandidates);

    // Séquence find() : checkAndTriggerRotation (1 appel) puis _executeRotation (2 appels)
    // Pas de compactage car activeGroup.length (10) === quotaActive (10)
    const checkRepo = makeChatRepo(activeChats);
    checkRepo.find
      .mockResolvedValueOnce(activeChats)  // activeGroup dans checkAndTriggerRotation
      .mockResolvedValueOnce(activeChats)  // activeGroup dans _executeRotation
      .mockResolvedValueOnce(lockedChats)  // remaining après batchRelease
      .mockResolvedValue([]);

    checkRepo.createQueryBuilder.mockReturnValue(qbCandidates);

    const { service, emitter } = buildService(checkRepo, {
      quotaActive: 10,
      quotaTotal: 50,
      reportService: reportSvc,
      obligationService: obligSvc,
    });

    await service.checkAndTriggerRotation('poste-1');

    const rotatedCall = emittedEvent(emitter, WINDOW_ROTATED_EVENT);
    expect(rotatedCall).toBeDefined();
    expect(rotatedCall![1].posteId).toBe('poste-1');
    expect(rotatedCall![1].releasedChatIds).toHaveLength(10);
    // Les 10 premières LOCKED deviennent ACTIVE (promues)
    expect(rotatedCall![1].promotedChatIds.length).toBeGreaterThan(0);
  });

  /**
   * Scénario : blocage car obligations incomplètes, puis déblocage après validation
   */
  it('E2E-02 : blocage puis déblocage après complétion des obligations', async () => {
    const chats = Array.from({ length: 10 }, (_, i) => makeActiveChat(i + 1));
    const repo = makeChatRepo(chats);

    // Premier appel: obligations incomplètes
    const obligSvc = {
      isEnabled: jest.fn().mockResolvedValue(true),
      checkAndRecordQuality: jest.fn().mockResolvedValue(true),
      getStatus: jest.fn()
        .mockResolvedValueOnce({ // 1er check: incomplet
          readyForRotation: false,
          qualityCheckPassed: false,
          annulee:      { done: 3, required: 5 },
          livree:       { done: 2, required: 5 },
          sansCommande: { done: 1, required: 5 },
        })
        .mockResolvedValue({ // 2e check (après complétion): prêt
          readyForRotation: true,
          qualityCheckPassed: true,
          annulee:      { done: 5, required: 5 },
          livree:       { done: 5, required: 5 },
          sansCommande: { done: 5, required: 5 },
        }),
      getOrCreateActiveBatch: jest.fn().mockResolvedValue({}),
    } as any;

    const { service, emitter } = buildService(repo, {
      quotaActive: 10,
      obligationService: obligSvc,
      submittedChatIds: chats.map((c) => c.chat_id),
    });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    // Premier appel: bloqué
    await service.checkAndTriggerRotation('poste-1');
    expect(emittedEvent(emitter, WINDOW_ROTATION_BLOCKED_EVENT)).toBeDefined();
    expect(performSpy).not.toHaveBeenCalled();

    // Réinitialiser les mocks pour le deuxième appel
    (emitter.emit as jest.Mock).mockClear();
    // Nouveau repo avec les mêmes chats (checkAndTriggerRotation refait les find)
    const repo2 = makeChatRepo(chats);
    const { service: service2, emitter: emitter2 } = buildService(repo2, {
      quotaActive: 10,
      obligationService: obligSvc,
      submittedChatIds: chats.map((c) => c.chat_id),
    });
    const performSpy2 = jest.spyOn(service2, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    // Deuxième appel: obligations complètes → rotation
    await service2.checkAndTriggerRotation('poste-1');
    expect(emittedEvent(emitter2, WINDOW_ROTATION_BLOCKED_EVENT)).toBeUndefined();
    expect(performSpy2).toHaveBeenCalledWith('poste-1');
  });

  /**
   * Scénario : poste avec peu de conversations (< 10)
   */
  it('E2E-03 : poste avec 3 conversations seulement — rotation sur 3/3 rapports', async () => {
    const chats = Array.from({ length: 3 }, (_, i) => makeActiveChat(i + 1));
    const repo = makeChatRepo(chats);
    const { service } = buildService(repo, {
      quotaActive: 10, // quota > nombre réel
      submittedChatIds: chats.map((c) => c.chat_id),
    });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    // Seuil adapté = 3 (nombre réel) → rotation déclenchée
    expect(performSpy).toHaveBeenCalledWith('poste-1');
  });

  /**
   * Scénario : conversation rouverte après rapport soumis (is_priority)
   */
  it('E2E-04 : une conversation is_priority ne bloque pas la rotation si rapport soumis', async () => {
    const priorityChat = makeActiveChat(1, { is_priority: true });
    const otherChats   = Array.from({ length: 9 }, (_, i) => makeActiveChat(i + 2));
    const allChats     = [priorityChat, ...otherChats];
    const repo = makeChatRepo(allChats);
    const { service } = buildService(repo, {
      quotaActive: 10,
      submittedChatIds: allChats.map((c) => c.chat_id),
    });
    const performSpy = jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

    await service.checkAndTriggerRotation('poste-1');

    expect(performSpy).toHaveBeenCalledWith('poste-1');
  });
});
