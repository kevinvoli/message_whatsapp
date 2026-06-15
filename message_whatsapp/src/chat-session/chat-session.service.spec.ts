/**
 * Tests unitaires — ChatSessionService
 *
 * Couverture :
 *  - computeWindows() (via openSession) : fenêtre normale ≈ now + TTL_NORMAL_HOURS (24h)
 *  - computeWindows() (via openSession) : session CTWA → freeEntryExpiresAt ≈ now + TTL_CTWA_HOURS (72h)
 *    et autoCloseAt = freeEntryExpiresAt si > serviceWindowExpiresAt
 *  - onClientMessage() : utilise le ttlCtwaHours passé en paramètre (pas la constante en dur)
 *    lors d'un upgrade CTWA (becomeCtwa)
 *  - openSession/onClientMessage/closeExpiredSessionAndChat mettent à jour windowExpiresAt
 *  - Idempotence : un appel répété de closeExpiredSessionAndChat ne change pas l'état final
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ChatSessionService } from './chat-session.service';
import { ChatSession } from './entities/chat-session.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { TTL_CTWA_HOURS, TTL_NORMAL_HOURS } from './constants';
import { mockRepository } from '../../test/helpers/mock-repository';
import { makeConversation } from '../../test/factories/conversation.factory';
import { makeChatSession } from '../../test/factories/chat-session.factory';

const HOUR_MS = 3_600_000;
const TOLERANCE_MS = 5_000; // tolérance de 5s pour les comparaisons de dates relatives

describe('ChatSessionService', () => {
  let service: ChatSessionService;

  const sessionRepo = mockRepository<ChatSession>();
  const chatRepo = mockRepository<WhatsappChat>();

  // Mock minimal de l'EntityManager utilisé dans dataSource.transaction()
  const managerMock = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    dataSource.transaction.mockImplementation(
      async (cb: (manager: typeof managerMock) => unknown) => cb(managerMock),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatSessionService,
        { provide: getRepositoryToken(ChatSession), useValue: sessionRepo },
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<ChatSessionService>(ChatSessionService);
  });

  // ─── computeWindows via openSession() — chat normal ──────────────────────────

  describe('openSession() — fenêtres calculées (computeWindows)', () => {
    it('chat normal (non CTWA) — autoCloseAt ≈ now + TTL_NORMAL_HOURS (24h)', async () => {
      // arrange
      const chat = makeConversation({ id: 'chat-uuid-001', activeSessionId: null });
      const qb = {
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(chat),
      };
      managerMock.createQueryBuilder.mockReturnValue(qb);
      managerMock.create.mockImplementation(
        (_entity: unknown, data: Partial<ChatSession>) => data as ChatSession,
      );
      managerMock.save.mockImplementation(async (_entity: unknown, data: ChatSession) => data);
      managerMock.update.mockResolvedValue({ affected: 1 });

      const before = Date.now();

      // act
      const session = await service.openSession('chat-uuid-001', false, TTL_NORMAL_HOURS, TTL_CTWA_HOURS);

      // assert — autoCloseAt ≈ now + 24h
      const expectedMs = before + TTL_NORMAL_HOURS * HOUR_MS;
      expect(session.autoCloseAt).not.toBeNull();
      expect(Math.abs(session.autoCloseAt!.getTime() - expectedMs)).toBeLessThan(TOLERANCE_MS);
      expect(session.freeEntryExpiresAt).toBeNull();

      // assert — whatsapp_chat.windowExpiresAt mis à jour avec autoCloseAt
      expect(managerMock.update).toHaveBeenCalledWith(
        WhatsappChat,
        { id: 'chat-uuid-001' },
        expect.objectContaining({ windowExpiresAt: session.autoCloseAt }),
      );
    });

    it('chat CTWA — freeEntryExpiresAt ≈ now + TTL_CTWA_HOURS (72h) et autoCloseAt = freeEntryExpiresAt', async () => {
      // arrange
      const chat = makeConversation({ id: 'chat-uuid-002', activeSessionId: null });
      const qb = {
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(chat),
      };
      managerMock.createQueryBuilder.mockReturnValue(qb);
      managerMock.create.mockImplementation(
        (_entity: unknown, data: Partial<ChatSession>) => data as ChatSession,
      );
      managerMock.save.mockImplementation(async (_entity: unknown, data: ChatSession) => data);
      managerMock.update.mockResolvedValue({ affected: 1 });

      const before = Date.now();

      // act
      const session = await service.openSession('chat-uuid-002', true, TTL_NORMAL_HOURS, TTL_CTWA_HOURS);

      // assert — freeEntryExpiresAt ≈ now + 72h
      const expectedFreeEntryMs = before + TTL_CTWA_HOURS * HOUR_MS;
      expect(session.freeEntryExpiresAt).not.toBeNull();
      expect(Math.abs(session.freeEntryExpiresAt!.getTime() - expectedFreeEntryMs)).toBeLessThan(TOLERANCE_MS);

      // assert — autoCloseAt = freeEntryExpiresAt (72h > serviceWindow 24h)
      expect(session.autoCloseAt!.getTime()).toBe(session.freeEntryExpiresAt!.getTime());

      // assert — windowExpiresAt synchronisé sur le chat
      expect(managerMock.update).toHaveBeenCalledWith(
        WhatsappChat,
        { id: 'chat-uuid-002' },
        expect.objectContaining({ windowExpiresAt: session.autoCloseAt, isCtwa: true }),
      );
    });
  });

  // ─── onClientMessage() — ttlCtwaHours en paramètre (pas codé en dur) ────────

  describe('onClientMessage() — upgrade CTWA avec ttlCtwaHours custom', () => {
    it('utilise le ttlCtwaHours fourni (48) pour calculer freeEntryExpiresAt lors d\'un upgrade CTWA, pas 72h en dur', async () => {
      // arrange — session existante non-CTWA, un referral arrive → upgrade CTWA
      const existingSession = makeChatSession({
        id: 'session-uuid-upgrade',
        whatsappChatId: 'chat-uuid-003',
        isCtwa: false,
        freeEntryExpiresAt: null,
      });
      sessionRepo.findOne.mockResolvedValue(existingSession);
      sessionRepo.update.mockResolvedValue({ affected: 1 });
      chatRepo.update.mockResolvedValue({ affected: 1 });

      const customTtlCtwaHours = 48;
      const before = Date.now();

      // act
      await service.onClientMessage(
        'session-uuid-upgrade',
        'chat-uuid-003',
        TTL_NORMAL_HOURS,
        customTtlCtwaHours,
        { sourceId: 'referral-001', headline: 'Promo été' },
      );

      // assert — freeEntryExpiresAt ≈ now + 48h (PAS 72h)
      const updateCall = sessionRepo.update.mock.calls[0][1] as Partial<ChatSession>;
      expect(updateCall.freeEntryExpiresAt).not.toBeNull();
      const expected48hMs = before + customTtlCtwaHours * HOUR_MS;
      const expected72hMs = before + TTL_CTWA_HOURS * HOUR_MS;

      expect(Math.abs(updateCall.freeEntryExpiresAt!.getTime() - expected48hMs)).toBeLessThan(TOLERANCE_MS);
      // S'assurer que ce n'est PAS la valeur 72h codée en dur
      expect(Math.abs(updateCall.freeEntryExpiresAt!.getTime() - expected72hMs)).toBeGreaterThan(HOUR_MS);

      expect(updateCall.isCtwa).toBe(true);
      expect(updateCall.ctwaReferralId).toBe('referral-001');

      // assert — windowExpiresAt du chat synchronisé sur autoCloseAt
      const chatPatch = chatRepo.update.mock.calls[0][1] as Partial<WhatsappChat>;
      expect(chatPatch.windowExpiresAt).toEqual(updateCall.autoCloseAt);
      expect(chatPatch.isCtwa).toBe(true);
    });

    it('utilise TTL_CTWA_HOURS (72h) par défaut si ttlCtwaHours non fourni', async () => {
      // arrange
      const existingSession = makeChatSession({
        id: 'session-uuid-default',
        whatsappChatId: 'chat-uuid-004',
        isCtwa: false,
        freeEntryExpiresAt: null,
      });
      sessionRepo.findOne.mockResolvedValue(existingSession);
      sessionRepo.update.mockResolvedValue({ affected: 1 });
      chatRepo.update.mockResolvedValue({ affected: 1 });

      const before = Date.now();

      // act — pas de ttlCtwaHours fourni → fallback TTL_CTWA_HOURS (72h)
      await service.onClientMessage(
        'session-uuid-default',
        'chat-uuid-004',
        TTL_NORMAL_HOURS,
        undefined,
        { sourceId: 'referral-002' },
      );

      // assert
      const updateCall = sessionRepo.update.mock.calls[0][1] as Partial<ChatSession>;
      const expected72hMs = before + TTL_CTWA_HOURS * HOUR_MS;
      expect(Math.abs(updateCall.freeEntryExpiresAt!.getTime() - expected72hMs)).toBeLessThan(TOLERANCE_MS);
    });

    it('ne touche pas freeEntryExpiresAt si pas d\'upgrade CTWA (session déjà non-CTWA, pas de referral)', async () => {
      // arrange
      const existingSession = makeChatSession({
        id: 'session-uuid-normal',
        whatsappChatId: 'chat-uuid-005',
        isCtwa: false,
        freeEntryExpiresAt: null,
      });
      sessionRepo.findOne.mockResolvedValue(existingSession);
      sessionRepo.update.mockResolvedValue({ affected: 1 });
      chatRepo.update.mockResolvedValue({ affected: 1 });

      const before = Date.now();

      // act
      await service.onClientMessage('session-uuid-normal', 'chat-uuid-005', TTL_NORMAL_HOURS);

      // assert — serviceWindowExpiresAt et autoCloseAt ≈ now + 24h, pas d'upgrade CTWA
      const updateCall = sessionRepo.update.mock.calls[0][1] as Partial<ChatSession>;
      expect(updateCall.freeEntryExpiresAt).toBeUndefined();
      const expected24hMs = before + TTL_NORMAL_HOURS * HOUR_MS;
      expect(Math.abs(updateCall.autoCloseAt!.getTime() - expected24hMs)).toBeLessThan(TOLERANCE_MS);
      expect(updateCall.isCtwa).toBeUndefined();
    });
  });

  // ─── closeExpiredSessionAndChat() — windowExpiresAt remis à null ────────────

  describe('closeExpiredSessionAndChat()', () => {
    it('ferme la session et remet windowExpiresAt à null sur le chat', async () => {
      // arrange
      managerMock.update.mockResolvedValue({ affected: 1 });
      managerMock.findOne.mockResolvedValue(makeConversation({ id: 'chat-uuid-006', chat_id: '33600000006@c.us' }));

      // act
      const chatId = await service.closeExpiredSessionAndChat('session-uuid-006', 'chat-uuid-006');

      // assert
      expect(chatId).toBe('33600000006@c.us');
      expect(managerMock.update).toHaveBeenCalledWith(
        ChatSession,
        { id: 'session-uuid-006' },
        expect.objectContaining({ endedAt: expect.any(Date) }),
      );
      expect(managerMock.update).toHaveBeenCalledWith(
        WhatsappChat,
        { id: 'chat-uuid-006' },
        expect.objectContaining({ windowExpiresAt: null, activeSessionId: null }),
      );
    });

    it('est idempotent — un second appel sur la même session ne change pas le résultat final', async () => {
      // arrange
      managerMock.update.mockResolvedValue({ affected: 1 });
      managerMock.findOne.mockResolvedValue(makeConversation({ id: 'chat-uuid-007', chat_id: '33600000007@c.us' }));

      // act
      const first = await service.closeExpiredSessionAndChat('session-uuid-007', 'chat-uuid-007');
      const second = await service.closeExpiredSessionAndChat('session-uuid-007', 'chat-uuid-007');

      // assert — même résultat, pas d'erreur au second appel
      expect(second).toBe(first);
      expect(managerMock.update).toHaveBeenCalledTimes(4); // 2 updates x 2 appels
    });
  });
});
