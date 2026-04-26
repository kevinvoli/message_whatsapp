import { EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsappChat, WindowStatus, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WindowRotationService, WINDOW_REPORT_SUBMITTED_EVENT } from '../services/window-rotation.service';

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
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
    getMany: jest.fn().mockImplementation(() =>
      Promise.resolve(chats.filter((c) => c.status === WhatsappChatStatus.FERME && c.window_slot != null)),
    ),
    getCount: jest.fn().mockResolvedValue(chats.length),
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
    getBlockProgress: jest.fn().mockResolvedValue({ validated: 0, total: 10 }),
  } as any;
}

function makeReportService(submittedChatIds: string[] = []) {
  const submitted = new Set(submittedChatIds);
  return {
    getSubmittedMapBulk: jest.fn().mockImplementation((chatIds: string[]) =>
      Promise.resolve(new Map(chatIds.map((chatId) => [chatId, submitted.has(chatId)]))),
    ),
  } as any;
}

function makeEventEmitter() {
  return {
    emit: jest.fn(),
  } as unknown as EventEmitter2;
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

    it('ignore les obligations d appel pour decider la rotation', async () => {
      const chats = Array.from({ length: 10 }, (_, idx) =>
        makeChat({ window_slot: idx + 1, window_status: WindowStatus.ACTIVE }),
      );
      const repo = makeChatRepo(chats);
      const obligationService = {
        isEnabled: jest.fn().mockReturnValue(true),
        checkAndRecordQuality: jest.fn(),
        isPosteReadyForRotation: jest.fn(),
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
      expect(obligationService.isEnabled).not.toHaveBeenCalled();
      expect(obligationService.checkAndRecordQuality).not.toHaveBeenCalled();
      expect(obligationService.isPosteReadyForRotation).not.toHaveBeenCalled();
    });
  });

  describe('handleConversationStatusChanged', () => {
    it('ignore les changements de statut non-ferme', async () => {
      const repo = makeChatRepo([]);
      const { service } = buildService(repo);
      await service.handleConversationStatusChanged({ chatId: 'chat-1', newStatus: 'actif' });
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('libere le slot quand la conversation est fermee', async () => {
      const chat = makeChat({ window_slot: 3, window_status: WindowStatus.ACTIVE });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo);
      await service.handleConversationStatusChanged({ chatId: chat.chat_id, newStatus: 'fermé' });
      expect(repo.update).toHaveBeenCalledWith(
        { id: chat.id },
        { window_slot: null, window_status: WindowStatus.RELEASED, is_locked: false },
      );
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
});
