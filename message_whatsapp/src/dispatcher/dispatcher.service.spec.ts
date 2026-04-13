import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DispatcherService } from './dispatcher.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { QueueService } from './services/queue.service';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';
import { DispatchQueryService } from './infrastructure/dispatch-query.service';
import { AssignConversationUseCase } from './application/assign-conversation.use-case';
import { ReinjectConversationUseCase } from './application/reinject-conversation.use-case';
import { RedispatchWaitingUseCase } from './application/redispatch-waiting.use-case';
import { ResetStuckActiveUseCase } from './application/reset-stuck-active.use-case';

/**
 * Tests de la façade DispatcherService.
 * La logique métier est couverte dans assign-conversation.use-case.spec.ts
 * et sla-policy.service.spec.ts.
 * Ici on vérifie que la façade délègue correctement et gère le mutex.
 */
describe('DispatcherService (façade)', () => {
  let service: DispatcherService;

  const chatRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
    create: jest.fn((data) => data),
  };
  const queueService = {
    getNextInQueue: jest.fn(),
    getQueuePositions: jest.fn(),
  };
  const conversationPublisher = {
    emitConversationReassigned: jest.fn(),
    emitConversationUpsertByChatId: jest.fn(),
    emitConversationAssigned: jest.fn(),
    emitConversationRemoved: jest.fn(),
    emitBatchReassignments: jest.fn(),
  };
  const queryService = {
    findChatByChatId: jest.fn(),
    findChatsByStatus: jest.fn(),
    findActiveChatsByPoste: jest.fn(),
    findWaitingChatsWithPoste: jest.fn(),
    findActiveChatsWithPoste: jest.fn(),
    saveChat: jest.fn(),
    createChat: jest.fn((data) => data),
    updateChat: jest.fn(),
  };
  const assignUseCase = { execute: jest.fn() };
  const reinjectUseCase = { execute: jest.fn() };
  const redispatchUseCase = { execute: jest.fn() };
  const resetStuckUseCase = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherService,
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepository },
        { provide: QueueService, useValue: queueService },
        { provide: ConversationPublisher, useValue: conversationPublisher },
        { provide: DispatchQueryService, useValue: queryService },
        { provide: AssignConversationUseCase, useValue: assignUseCase },
        { provide: ReinjectConversationUseCase, useValue: reinjectUseCase },
        { provide: RedispatchWaitingUseCase, useValue: redispatchUseCase },
        { provide: ResetStuckActiveUseCase, useValue: resetStuckUseCase },
      ],
    }).compile();

    service = module.get<DispatcherService>(DispatcherService);
  });

  // ─── Délégation aux use cases ────────────────────────────────────────────

  it('assignConversation délègue à AssignConversationUseCase.execute()', async () => {
    const fakeChat = { chat_id: 'c@c.us', status: WhatsappChatStatus.ACTIF } as WhatsappChat;
    assignUseCase.execute.mockResolvedValue(fakeChat);

    const result = await service.assignConversation('c@c.us', 'Client', 'trace-1', 'tenant-1', 'ch-1');

    expect(assignUseCase.execute).toHaveBeenCalledWith('c@c.us', 'Client', 'trace-1', 'tenant-1', 'ch-1');
    expect(result).toBe(fakeChat);
  });

  it('reinjectConversation délègue à ReinjectConversationUseCase.execute()', async () => {
    const chat = { chat_id: 'c@c.us', read_only: false } as WhatsappChat;
    reinjectUseCase.execute.mockResolvedValue({ oldPosteId: 'p1', newPosteId: 'p2' });

    const result = await service.reinjectConversation(chat, false);

    expect(reinjectUseCase.execute).toHaveBeenCalledWith(chat, false);
    expect(result).toEqual({ oldPosteId: 'p1', newPosteId: 'p2' });
  });

  it('redispatchWaiting délègue à RedispatchWaitingUseCase.execute()', async () => {
    redispatchUseCase.execute.mockResolvedValue({ dispatched: 3, still_waiting: 1 });

    const result = await service.redispatchWaiting();

    expect(redispatchUseCase.execute).toHaveBeenCalled();
    expect(result).toEqual({ dispatched: 3, still_waiting: 1 });
  });

  it('resetStuckActiveToWaiting délègue à ResetStuckActiveUseCase.execute()', async () => {
    resetStuckUseCase.execute.mockResolvedValue({ reset: 5 });

    const result = await service.resetStuckActiveToWaiting();

    expect(resetStuckUseCase.execute).toHaveBeenCalled();
    expect(result).toEqual({ reset: 5 });
  });

  // ─── jobRunnerAllPostes ──────────────────────────────────────────────────

  it('jobRunnerAllPostes réinjecte les chats SLA expirés en batch', async () => {
    const chat1 = { id: '1', chat_id: 'c1@c.us', status: WhatsappChatStatus.ACTIF } as WhatsappChat;
    const chat2 = { id: '2', chat_id: 'c2@c.us', status: WhatsappChatStatus.EN_ATTENTE } as WhatsappChat;
    queryService.findChatsByStatus.mockResolvedValue([chat1, chat2]);
    reinjectUseCase.execute
      .mockResolvedValueOnce({ oldPosteId: 'p1', newPosteId: 'p2' })
      .mockResolvedValueOnce(null); // 2e conversation : pas de changement (deadline étendue)
    conversationPublisher.emitBatchReassignments.mockResolvedValue(undefined);

    const result = await service.jobRunnerAllPostes(121);

    expect(reinjectUseCase.execute).toHaveBeenCalledTimes(2);
    expect(conversationPublisher.emitBatchReassignments).toHaveBeenCalledWith([
      { chatId: 'c1@c.us', oldPosteId: 'p1', newPosteId: 'p2' },
    ]);
    expect(result).toContain('1 conversation(s) réinjectée(s)');
  });

  it('jobRunnerAllPostes est idempotent si déjà en cours', async () => {
    queryService.findChatsByStatus.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 200)),
    );

    const [r1, r2] = await Promise.all([
      service.jobRunnerAllPostes(121),
      service.jobRunnerAllPostes(121),
    ]);

    // L'un des deux doit être ignoré
    const results = [r1, r2];
    expect(results.some((r) => r.includes('Ignoré'))).toBe(true);
  });

  // ─── getDispatchSnapshot ─────────────────────────────────────────────────

  it('getDispatchSnapshot retourne les métriques agrégées', async () => {
    queueService.getQueuePositions.mockResolvedValue([{}, {}]); // 2 postes en queue
    queryService.findWaitingChatsWithPoste.mockResolvedValue([{ id: 'w1' }]);
    queryService.findActiveChatsWithPoste.mockResolvedValue([
      { id: 'a1', poste: { is_active: true } },  // normal
      { id: 'a2', poste: { is_active: false } },  // stuck
    ]);

    const snapshot = await service.getDispatchSnapshot();

    expect(snapshot.queue_size).toBe(2);
    expect(snapshot.waiting_count).toBe(1);
    expect(snapshot.stuck_active_count).toBe(1);
  });
});
