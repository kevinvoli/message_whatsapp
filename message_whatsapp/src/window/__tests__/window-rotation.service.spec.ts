import { EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsappChat, WindowStatus, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WindowRotationService, WINDOW_REPORT_SUBMITTED_EVENT, WINDOW_ROTATED_EVENT } from '../services/window-rotation.service';

function makeChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return Object.assign(new WhatsappChat(), {
    id: `uuid-${Math.random().toString(36).slice(2)}`,
    chat_id: `chat-${Math.random().toString(36).slice(2)}`,
    poste_id: 'poste-abc',
    window_slot: 1,
    window_status: WindowStatus.ACTIVE,
    status: WhatsappChatStatus.ACTIF,
    is_locked: false,
    deletedAt: null,
    last_activity_at: new Date(),
    ...overrides,
  });
}

function makeChatRepo(chats: WhatsappChat[] = []) {
  const qb: any = {
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
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(chats.length),
    getRawMany: jest.fn().mockResolvedValue([{ posteId: 'poste-abc' }]),
  };

  return {
    find: jest.fn().mockResolvedValue(chats),
    findOne: jest.fn().mockResolvedValue(chats[0] ?? null),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(chats.length),
    query: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    _qb: qb,
  } as any;
}

function makeCapacityService(quotaActive = 10, quotaTotal = 50, windowModeEnabled = true) {
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
      Promise.resolve(new Map(chatIds.map((chatId) => [chatId, submitted.has(chatId)]))),
    ),
    resetSubmissionBulk: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeEventEmitter() {
  return {
    emit: jest.fn(),
  } as unknown as EventEmitter2;
}

/** Mock lockService : exécute toujours le callback (verrou toujours acquis). */
function makeLockService() {
  return {
    tryWithLock: jest.fn().mockImplementation(
      async (_resource: string, _ttl: number, fn: () => Promise<unknown>) => {
        const result = await fn();
        return { acquired: true, result };
      },
    ),
  } as any;
}

function buildService(
  chatRepo: any,
  opts: {
    quotaActive?: number;
    quotaTotal?: number;
    obligationService?: any;
    submittedChatIds?: string[];
    reportService?: any;
  } = {},
) {
  const emitter = makeEventEmitter();
  const reportService = opts.reportService ?? makeReportService(opts.submittedChatIds ?? []);
  const service = new WindowRotationService(
    chatRepo,
    makeCapacityService(opts.quotaActive ?? 10, opts.quotaTotal ?? 50),
    makeValidationEngine(),
    emitter,
    reportService,
    makeLockService(),
    opts.obligationService as any,
  );
  return { service, emitter, reportService };
}

describe('WindowRotationService', () => {
  describe('checkAndTriggerRotation', () => {
    it('ne declenche pas la rotation si un seul actif a un rapport soumis', async () => {
      const chats = [makeChat({ window_status: WindowStatus.ACTIVE })];
      const repo = makeChatRepo(chats);
      const { service } = buildService(repo, { submittedChatIds: chats.map((c) => c.chat_id) });

      await service.checkAndTriggerRotation('poste-abc');

      const updateCalls = (repo.update as jest.Mock).mock.calls;
      const releaseCalls = updateCalls.filter((c) => c[1]?.window_status === WindowStatus.RELEASED);
      expect(releaseCalls).toHaveLength(0);
    });

    it('ne declenche pas si le bloc actif est inferieur au quota', async () => {
      const chats = [
        makeChat({ window_status: WindowStatus.ACTIVE }),
        makeChat({ window_status: WindowStatus.ACTIVE }),
      ];
      const repo = makeChatRepo(chats);
      const { service } = buildService(repo, {
        quotaActive: 10,
        submittedChatIds: chats.map((c) => c.chat_id),
      });

      await service.checkAndTriggerRotation('poste-abc');

      const updateCalls = (repo.update as jest.Mock).mock.calls;
      const releaseCalls = updateCalls.filter((c) => c[1]?.window_status === WindowStatus.RELEASED);
      expect(releaseCalls).toHaveLength(0);
    });

    it('declenche la rotation quand les 10 conversations actives ont un rapport soumis', async () => {
      const chats = Array.from({ length: 10 }, (_, idx) =>
        makeChat({ window_slot: idx + 1, window_status: WindowStatus.ACTIVE }),
      );
      const repo = makeChatRepo(chats);
      const { service } = buildService(repo, {
        quotaActive: 10,
        submittedChatIds: chats.map((c) => c.chat_id),
      });
      const performRotation = jest
        .spyOn(service, 'performRotation')
        .mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      expect(performRotation).toHaveBeenCalledWith('poste-abc');
    });

    it('declenche la rotation quand les 10 rapports sont soumis meme avec des conversations fermees', async () => {
      const chats = Array.from({ length: 10 }, (_, idx) =>
        makeChat({
          window_slot: idx + 1,
          window_status: WindowStatus.ACTIVE,
          status: idx % 2 === 0 ? WhatsappChatStatus.FERME : WhatsappChatStatus.ACTIF,
        }),
      );
      const repo = makeChatRepo(chats);
      const { service } = buildService(repo, {
        quotaActive: 10,
        submittedChatIds: chats.map((c) => c.chat_id),
      });
      const performRotation = jest
        .spyOn(service, 'performRotation')
        .mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      expect(performRotation).toHaveBeenCalledWith('poste-abc');
    });

    it('ne declenche pas avec 10 conversations actives sans rapport soumis', async () => {
      const chats = Array.from({ length: 10 }, (_, idx) =>
        makeChat({ window_slot: idx + 1, window_status: WindowStatus.ACTIVE }),
      );
      const repo = makeChatRepo(chats);
      const { service, reportService } = buildService(repo, {
        quotaActive: 10,
        submittedChatIds: [],
      });
      const performRotation = jest
        .spyOn(service, 'performRotation')
        .mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      expect(reportService.getSubmittedMapBulk).toHaveBeenCalledWith(chats.map((c) => c.chat_id));
      expect(performRotation).not.toHaveBeenCalled();
    });

    it('declenche la rotation meme si obligation service est actif et readyForRotation est vrai', async () => {
      const chats = Array.from({ length: 10 }, (_, idx) =>
        makeChat({ window_slot: idx + 1, window_status: WindowStatus.ACTIVE }),
      );
      const repo = makeChatRepo(chats);
      const obligationService = {
        isEnabled:             jest.fn().mockResolvedValue(true),
        getStatus:             jest.fn().mockResolvedValue({
          readyForRotation: true,
          qualityCheckPassed: true,
          annulee:      { done: 5, required: 5 },
          livree:       { done: 5, required: 5 },
          sansCommande: { done: 5, required: 5 },
        }),
        checkAndRecordQuality: jest.fn().mockResolvedValue(true),
        getOrCreateActiveBatch: jest.fn().mockResolvedValue({}),
      };
      const { service } = buildService(repo, {
        quotaActive: 10,
        obligationService,
        submittedChatIds: chats.map((c) => c.chat_id),
      });
      const performRotation = jest
        .spyOn(service, 'performRotation')
        .mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      expect(performRotation).toHaveBeenCalledWith('poste-abc');
    });
  });

  // ─── OBL-022 : rotation avec obligations activées/désactivées ────────────────

  describe('OBL-022 — obligations et rotation', () => {
    function makeObligationService(
      enabled: boolean,
      readyForRotation: boolean,
      qualityOk: boolean,
      callsDone = 15,
    ) {
      const total = 15;
      const done  = callsDone;
      return {
        isEnabled:             jest.fn().mockResolvedValue(enabled),
        checkAndRecordQuality: jest.fn().mockResolvedValue(qualityOk),
        getStatus:             jest.fn().mockResolvedValue({
          readyForRotation,
          qualityCheckPassed: qualityOk,
          annulee:      { done: Math.min(done, 5),       required: 5 },
          livree:       { done: Math.min(done - 5, 5),   required: 5 },
          sansCommande: { done: Math.min(done - 10, 5),  required: 5 },
        }),
        getOrCreateActiveBatch: jest.fn().mockResolvedValue({}),
      };
    }

    it('obligations désactivées → rotation sans vérification des obligations', async () => {
      const chats = Array.from({ length: 10 }, (_, i) =>
        makeChat({ window_slot: i + 1 }),
      );
      const repo = makeChatRepo(chats);
      const obligSvc = makeObligationService(false, false, false, 0);
      const { service } = buildService(repo, {
        quotaActive: 10,
        obligationService: obligSvc,
        submittedChatIds: chats.map((c) => c.chat_id),
      });
      const performRotation = jest
        .spyOn(service, 'performRotation')
        .mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      expect(obligSvc.getStatus).not.toHaveBeenCalled();
      expect(performRotation).toHaveBeenCalledWith('poste-abc');
    });

    it('obligations activées + appels incomplets → blocage call_obligations_incomplete', async () => {
      const chats = Array.from({ length: 10 }, (_, i) =>
        makeChat({ window_slot: i + 1 }),
      );
      const repo = makeChatRepo(chats);
      // Seulement 8 appels validés sur 15
      const obligSvc = makeObligationService(true, false, false, 8);
      const { service, emitter } = buildService(repo, {
        quotaActive: 10,
        obligationService: obligSvc,
        submittedChatIds: chats.map((c) => c.chat_id),
      });
      jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      const blockedCall = (emitter.emit as jest.Mock).mock.calls.find(([e]) => e === 'window.rotation_blocked');
      expect(blockedCall).toBeDefined();
      expect(blockedCall![1].reason).toBe('call_obligations_incomplete');
    });

    it('obligations activées + appels complets + qualité KO → blocage quality_check_failed', async () => {
      const chats = Array.from({ length: 10 }, (_, i) =>
        makeChat({ window_slot: i + 1 }),
      );
      const repo = makeChatRepo(chats);
      // 15/15 appels mais qualité KO
      const obligSvc = makeObligationService(true, false, false, 15);
      const { service, emitter } = buildService(repo, {
        quotaActive: 10,
        obligationService: obligSvc,
        submittedChatIds: chats.map((c) => c.chat_id),
      });
      jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      const blockedCall = (emitter.emit as jest.Mock).mock.calls.find(([e]) => e === 'window.rotation_blocked');
      expect(blockedCall).toBeDefined();
      expect(blockedCall![1].reason).toBe('quality_check_failed');
    });

    it('obligations activées + appels complets + qualité OK → rotation', async () => {
      const chats = Array.from({ length: 10 }, (_, i) =>
        makeChat({ window_slot: i + 1 }),
      );
      const repo = makeChatRepo(chats);
      const obligSvc = makeObligationService(true, true, true, 15);
      const { service, emitter } = buildService(repo, {
        quotaActive: 10,
        obligationService: obligSvc,
        submittedChatIds: chats.map((c) => c.chat_id),
      });
      const performRotation = jest
        .spyOn(service, 'performRotation')
        .mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      expect(performRotation).toHaveBeenCalledWith('poste-abc');
      expect(emitter.emit).not.toHaveBeenCalledWith('window.rotation_blocked', expect.anything());
    });

    it('OBL-003 — qualité calculée seulement si appels complets, getStatus relu après', async () => {
      const chats = Array.from({ length: 10 }, (_, i) =>
        makeChat({ window_slot: i + 1 }),
      );
      const repo = makeChatRepo(chats);
      // 15/15 appels → callsComplete = true → checkAndRecordQuality doit être appelé
      const obligSvc = makeObligationService(true, true, true, 15);
      const { service } = buildService(repo, {
        quotaActive: 10,
        obligationService: obligSvc,
        submittedChatIds: chats.map((c) => c.chat_id),
      });
      jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      // getStatus est appelé deux fois : avant (pour vérifier si appels complets) et après (relecture)
      expect(obligSvc.getStatus).toHaveBeenCalledTimes(2);
      // checkAndRecordQuality est appelé entre les deux appels à getStatus
      const qualityOrder = (obligSvc.checkAndRecordQuality as jest.Mock).mock.invocationCallOrder[0];
      const status2Order = (obligSvc.getStatus as jest.Mock).mock.invocationCallOrder[1];
      expect(qualityOrder).toBeLessThan(status2Order);
    });

    it('OBL-003 — checkAndRecordQuality non appelé si appels incomplets', async () => {
      const chats = Array.from({ length: 10 }, (_, i) =>
        makeChat({ window_slot: i + 1 }),
      );
      const repo = makeChatRepo(chats);
      // 8/15 appels → callsComplete = false → checkAndRecordQuality ne doit PAS être appelé
      const obligSvc = makeObligationService(true, false, false, 8);
      const { service } = buildService(repo, {
        quotaActive: 10,
        obligationService: obligSvc,
        submittedChatIds: chats.map((c) => c.chat_id),
      });
      jest.spyOn(service, 'performRotation').mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      expect(obligSvc.checkAndRecordQuality).not.toHaveBeenCalled();
      // getStatus appelé une seule fois (pas de relecture après qualité)
      expect(obligSvc.getStatus).toHaveBeenCalledTimes(1);
    });

    it('rapports incomplets → obligations non vérifiées', async () => {
      const chats = Array.from({ length: 10 }, (_, i) =>
        makeChat({ window_slot: i + 1 }),
      );
      const repo = makeChatRepo(chats);
      const obligSvc = makeObligationService(true, false, false, 0);
      const { service } = buildService(repo, {
        quotaActive: 10,
        obligationService: obligSvc,
        submittedChatIds: [], // aucun rapport soumis
      });

      await service.checkAndTriggerRotation('poste-abc');

      expect(obligSvc.getStatus).not.toHaveBeenCalled();
      expect(obligSvc.checkAndRecordQuality).not.toHaveBeenCalled();
    });
  });

  describe('handleConversationStatusChanged', () => {
    it('ignore les changements de statut non-ferme', async () => {
      const repo = makeChatRepo([]);
      const { service } = buildService(repo);
      await service.handleConversationStatusChanged({ chatId: 'chat-1', newStatus: 'actif' });
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('conserve le slot et verifie la rotation quand la conversation est fermee', async () => {
      // La conv FERMÉ conserve son slot — checkAndTriggerRotation est appelé.
      // La libération (batchRelease) n'intervient qu'au moment de la rotation complète du bloc.
      const chat = makeChat({ window_slot: 3, window_status: WindowStatus.ACTIVE });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo);
      const check = jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

      await service.handleConversationStatusChanged({ chatId: chat.chat_id, newStatus: 'fermé' });

      expect(check).toHaveBeenCalledWith(chat.poste_id);
    });

    it('ne libere pas immediatement une conversation fermee dont le rapport est soumis', async () => {
      const chat = makeChat({
        window_slot: 3,
        window_status: WindowStatus.ACTIVE,
        status: WhatsappChatStatus.FERME,
      });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo, { submittedChatIds: [chat.chat_id] });
      const check = jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

      await service.handleConversationStatusChanged({ chatId: chat.chat_id, newStatus: 'fermé' });

      expect(repo.update).not.toHaveBeenCalled();
      expect(check).toHaveBeenCalledWith('poste-abc');
    });

    it('ignore si la conversation n a pas de slot', async () => {
      const chat = makeChat({ window_slot: null, window_status: null });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo);
      await service.handleConversationStatusChanged({ chatId: chat.chat_id, newStatus: 'fermé' });
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('handleConversationResultSet', () => {
    it('emet WINDOW_REPORT_SUBMITTED_EVENT avec chatId et posteId', async () => {
      const chat = makeChat({ window_status: WindowStatus.ACTIVE });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service, emitter } = buildService(repo);
      await service.handleConversationResultSet({ chatId: chat.chat_id, posteId: 'poste-abc' });
      expect(emitter.emit).toHaveBeenCalledWith(
        WINDOW_REPORT_SUBMITTED_EVENT,
        expect.objectContaining({ posteId: 'poste-abc', chatId: chat.chat_id }),
      );
    });

    it('ne fait rien si posteId absent', async () => {
      const repo = makeChatRepo([]);
      const { service, emitter } = buildService(repo);
      await service.handleConversationResultSet({ chatId: 'chat-1', posteId: null });
      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('autoCheckRotations', () => {
    it('lance automatiquement le check des postes avec une fenetre ouverte', async () => {
      const repo = makeChatRepo([]);
      const { service } = buildService(repo);
      const check = jest.spyOn(service, 'checkAndTriggerRotation').mockResolvedValue(undefined);

      await service.autoCheckRotations();

      expect(check).toHaveBeenCalledWith('poste-abc');
    });
  });

  // ─── E01-T05 : scénarios rotation bloc de 10 ────────────────────────────────

  describe('E01-T05 rotation bloc de 10', () => {
    it('9 rapports soumis sur 10 ne declenchent pas la rotation', async () => {
      const chats = Array.from({ length: 10 }, (_, idx) =>
        makeChat({ window_slot: idx + 1, window_status: WindowStatus.ACTIVE }),
      );
      // Seulement 9 des 10 conversations ont un rapport soumis.
      const submittedChatIds = chats.slice(0, 9).map((c) => c.chat_id);
      const repo = makeChatRepo(chats);
      const { service } = buildService(repo, { quotaActive: 10, submittedChatIds });
      const performRotation = jest
        .spyOn(service, 'performRotation')
        .mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      expect(performRotation).not.toHaveBeenCalled();
    });

    it('10 conversations actives avec rapports soumis declenchent l emission WINDOW_ROTATED', async () => {
      const chats = Array.from({ length: 10 }, (_, idx) =>
        makeChat({ window_slot: idx + 1, window_status: WindowStatus.ACTIVE }),
      );
      const allChatIds = chats.map((c) => c.chat_id);

      // reportService : toutes les convs actives sont soumises ; find() retourne le bloc actif.
      const reportService = makeReportService(allChatIds);
      const repo = makeChatRepo(chats);
      // find() pour le bloc actif, pour le bloc restant après libération, et pour les candidats.
      // On retourne une liste vide pour les candidats d'injection (pas d'injection).
      repo.find
        .mockResolvedValueOnce(chats)   // bloc actif initial
        .mockResolvedValueOnce(chats)   // recheck après compactage (même chats)
        .mockResolvedValueOnce([])      // remaining après batchRelease
        .mockResolvedValue([]);         // injection — aucun candidat

      const { service, emitter } = buildService(repo, { quotaActive: 10, reportService });

      await service.performRotation('poste-abc');

      expect(emitter.emit).toHaveBeenCalledWith(
        WINDOW_ROTATED_EVENT,
        expect.objectContaining({
          posteId: 'poste-abc',
          releasedChatIds: expect.arrayContaining(allChatIds),
        }),
      );
    });

    it('10 conversations fermees avec rapports soumis declenchent la rotation', async () => {
      const chats = Array.from({ length: 10 }, (_, idx) =>
        makeChat({
          window_slot: idx + 1,
          window_status: WindowStatus.ACTIVE,
          status: WhatsappChatStatus.FERME,
        }),
      );
      const repo = makeChatRepo(chats);
      const { service } = buildService(repo, {
        quotaActive: 10,
        submittedChatIds: chats.map((c) => c.chat_id),
      });
      const performRotation = jest
        .spyOn(service, 'performRotation')
        .mockResolvedValue({ releasedChatIds: [], promotedChatIds: [] });

      await service.checkAndTriggerRotation('poste-abc');

      expect(performRotation).toHaveBeenCalledWith('poste-abc');
    });

    it('les conversations relachees ne reapparaissent pas dans la fenetre apres rotation', async () => {
      const releasedChats = Array.from({ length: 10 }, (_, idx) =>
        makeChat({ window_slot: idx + 1, window_status: WindowStatus.ACTIVE }),
      );
      const allSubmitted = releasedChats.map((c) => c.chat_id);
      const reportService = makeReportService(allSubmitted);
      const repo = makeChatRepo(releasedChats);
      // Après libération, find() pour les remaining ne retourne aucune conv (toutes relâchées).
      // find() pour les candidats d'injection ne retourne pas les releasedChats.
      repo.find
        .mockResolvedValueOnce(releasedChats)   // bloc actif initial
        .mockResolvedValueOnce(releasedChats)   // recheck après compactage
        .mockResolvedValueOnce([])              // remaining vide après batchRelease
        .mockResolvedValue([]);                 // aucun candidat d'injection

      const { service } = buildService(repo, { quotaActive: 10, reportService });

      const result = await service.performRotation('poste-abc');

      // Les conversations libérées ne doivent pas être dans promotedChatIds.
      const releasedSet = new Set(allSubmitted);
      for (const chatId of result.promotedChatIds) {
        expect(releasedSet.has(chatId)).toBe(false);
      }
      expect(result.releasedChatIds).toEqual(expect.arrayContaining(allSubmitted));
    });

    it('emets WINDOW_ROTATED avec la liste exacte des releasedChatIds', async () => {
      const chats = Array.from({ length: 10 }, (_, idx) =>
        makeChat({ window_slot: idx + 1, window_status: WindowStatus.ACTIVE }),
      );
      const submittedIds = chats.slice(0, 5).map((c) => c.chat_id);
      const remainingChats = chats.slice(5);
      const reportService = makeReportService(submittedIds);
      const repo = makeChatRepo(chats);
      repo.find
        .mockResolvedValueOnce(chats)          // bloc actif initial
        .mockResolvedValueOnce(chats)          // recheck après compactage
        .mockResolvedValueOnce(remainingChats) // remaining après batchRelease
        .mockResolvedValue([]);                // aucun candidat d'injection

      const { service, emitter } = buildService(repo, { quotaActive: 10, reportService });

      await service.performRotation('poste-abc');

      const rotatedCall = (emitter.emit as jest.Mock).mock.calls.find(
        ([event]) => event === WINDOW_ROTATED_EVENT,
      );
      expect(rotatedCall).toBeDefined();
      const payload = rotatedCall![1];
      expect(payload.releasedChatIds).toHaveLength(submittedIds.length);
      expect(payload.releasedChatIds).toEqual(expect.arrayContaining(submittedIds));
    });
  });
});
