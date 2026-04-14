/**
 * SPRINT-17 — Tests unitaires : DispatchQueryService (correction AM#1)
 *
 * AM#1 CRITIQUE : le SLA Checker ignorait les conversations où unread_count = 0
 * mais où le commercial avait lu sans répondre (last_client_message_at > last_poste_message_at).
 *
 * Ces tests vérifient que findChatsByStatus utilise bien la condition OR étendue :
 *   (unread_count > 0 OR last_poste_message_at IS NULL OR last_client_message_at > last_poste_message_at)
 *
 * Niveau : tests unitaires — QueryBuilder mocké.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DispatchQueryService } from './dispatch-query.service';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return {
    id: 'chat-uuid-1',
    chat_id: '33612345678@s.whatsapp.net',
    status: WhatsappChatStatus.ACTIF,
    poste_id: 'poste-1',
    unread_count: 0,
    last_client_message_at: new Date(Date.now() - 200 * 60_000),
    last_poste_message_at: null,
    read_only: false,
    ...overrides,
  } as unknown as WhatsappChat;
}

// ─── QueryBuilder mock ────────────────────────────────────────────────────────

function makeQbMock(result: WhatsappChat[]) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DispatchQueryService — AM#1 fix', () => {
  let service: DispatchQueryService;
  let chatRepoMock: { find: jest.Mock; createQueryBuilder: jest.Mock };
  let qbMock: ReturnType<typeof makeQbMock>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchQueryService,
        {
          provide: getRepositoryToken(WhatsappChat),
          useFactory: () => chatRepoMock,
        },
        { provide: getRepositoryToken(WhatsappPoste), useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    service = module.get(DispatchQueryService);
  });

  describe('findChatsByStatus sans olderThan', () => {
    it('utilise find() simple (pas de QueryBuilder)', async () => {
      chatRepoMock = {
        find: jest.fn().mockResolvedValue([makeChat()]),
        createQueryBuilder: jest.fn(),
      };
      // Recompile avec le nouveau mock
      const mod = await Test.createTestingModule({
        providers: [
          DispatchQueryService,
          { provide: getRepositoryToken(WhatsappChat), useValue: chatRepoMock },
          { provide: getRepositoryToken(WhatsappPoste), useValue: { findOne: jest.fn() } },
        ],
      }).compile();
      const svc = mod.get(DispatchQueryService);

      const result = await svc.findChatsByStatus([WhatsappChatStatus.ACTIF]);
      expect(chatRepoMock.find).toHaveBeenCalledTimes(1);
      expect(chatRepoMock.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findChatsByStatus avec olderThan (chemin SLA)', () => {
    let svc: DispatchQueryService;

    beforeEach(async () => {
      qbMock = makeQbMock([makeChat({ unread_count: 0, last_poste_message_at: null })]);
      chatRepoMock = {
        find: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      };
      const mod = await Test.createTestingModule({
        providers: [
          DispatchQueryService,
          { provide: getRepositoryToken(WhatsappChat), useValue: chatRepoMock },
          { provide: getRepositoryToken(WhatsappPoste), useValue: { findOne: jest.fn() } },
        ],
      }).compile();
      svc = mod.get(DispatchQueryService);
    });

    it('appelle createQueryBuilder (pas find)', async () => {
      const threshold = new Date(Date.now() - 121 * 60_000);
      await svc.findChatsByStatus([WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE], {
        olderThan: threshold,
        limit: 50,
      });
      expect(chatRepoMock.createQueryBuilder).toHaveBeenCalledWith('chat');
      expect(chatRepoMock.find).not.toHaveBeenCalled();
    });

    it('filtre sur last_client_message_at < threshold', async () => {
      const threshold = new Date(Date.now() - 121 * 60_000);
      await svc.findChatsByStatus([WhatsappChatStatus.ACTIF], { olderThan: threshold });
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'chat.last_client_message_at < :threshold',
        { threshold },
      );
    });

    it('ajoute la condition OR étendue (AM#1 fix)', async () => {
      const threshold = new Date(Date.now() - 121 * 60_000);
      await svc.findChatsByStatus([WhatsappChatStatus.ACTIF], { olderThan: threshold });

      // Vérifier que la condition OR est présente
      const orCallArgs = qbMock.andWhere.mock.calls.find(([arg]: [string]) =>
        arg.includes('unread_count > 0') &&
        arg.includes('last_poste_message_at IS NULL') &&
        arg.includes('last_client_message_at > chat.last_poste_message_at'),
      );
      expect(orCallArgs).toBeDefined();
    });

    it('exclut les conversations orphelines poste_id IS NULL (AM#3 fix)', async () => {
      const threshold = new Date(Date.now() - 121 * 60_000);
      await svc.findChatsByStatus([WhatsappChatStatus.ACTIF], { olderThan: threshold });

      // Le SLA checker ne doit pas traiter les orphelins — gérés par orphan-checker uniquement
      const notNullCall = qbMock.andWhere.mock.calls.find(([arg]: [string]) =>
        arg.includes('poste_id IS NOT NULL'),
      );
      expect(notNullCall).toBeDefined();
    });

    it('applique take() si limit est fourni', async () => {
      const threshold = new Date(Date.now() - 121 * 60_000);
      await svc.findChatsByStatus([WhatsappChatStatus.ACTIF], { olderThan: threshold, limit: 50 });
      expect(qbMock.take).toHaveBeenCalledWith(50);
    });

    it('n\'appelle pas take() si limit absent', async () => {
      const threshold = new Date(Date.now() - 121 * 60_000);
      await svc.findChatsByStatus([WhatsappChatStatus.ACTIF], { olderThan: threshold });
      expect(qbMock.take).not.toHaveBeenCalled();
    });

    it('ajoute leftJoinAndSelect si withPoste=true', async () => {
      const threshold = new Date(Date.now() - 121 * 60_000);
      await svc.findChatsByStatus([WhatsappChatStatus.ACTIF], { olderThan: threshold, withPoste: true });
      expect(qbMock.leftJoinAndSelect).toHaveBeenCalledWith('chat.poste', 'poste');
    });

    it('n\'ajoute pas join si withPoste absent', async () => {
      const threshold = new Date(Date.now() - 121 * 60_000);
      await svc.findChatsByStatus([WhatsappChatStatus.ACTIF], { olderThan: threshold });
      expect(qbMock.leftJoinAndSelect).not.toHaveBeenCalled();
    });
  });

  describe('findActiveChatsByPoste (AM#1 fix)', () => {
    let svc: DispatchQueryService;

    beforeEach(async () => {
      qbMock = makeQbMock([makeChat({ poste_id: 'poste-99', unread_count: 0 })]);
      chatRepoMock = {
        find: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      };
      const mod = await Test.createTestingModule({
        providers: [
          DispatchQueryService,
          { provide: getRepositoryToken(WhatsappChat), useValue: chatRepoMock },
          { provide: getRepositoryToken(WhatsappPoste), useValue: { findOne: jest.fn() } },
        ],
      }).compile();
      svc = mod.get(DispatchQueryService);
    });

    it('utilise createQueryBuilder', async () => {
      await svc.findActiveChatsByPoste('poste-99');
      expect(chatRepoMock.createQueryBuilder).toHaveBeenCalledWith('chat');
    });

    it('filtre sur poste_id', async () => {
      await svc.findActiveChatsByPoste('poste-99');
      expect(qbMock.where).toHaveBeenCalledWith('chat.poste_id = :posteId', { posteId: 'poste-99' });
    });

    it('inclut la condition OR étendue (unread = 0 mais lu sans répondre)', async () => {
      await svc.findActiveChatsByPoste('poste-99');
      const orCall = qbMock.andWhere.mock.calls.find(([arg]: [string]) =>
        arg.includes('unread_count > 0') && arg.includes('last_poste_message_at IS NULL'),
      );
      expect(orCall).toBeDefined();
    });

    it('retourne les conversations même avec unread_count = 0', async () => {
      const result = await svc.findActiveChatsByPoste('poste-99');
      // Le mock retourne 1 chat avec unread_count = 0 → doit être retourné
      expect(result).toHaveLength(1);
      expect(result[0].unread_count).toBe(0);
    });
  });
});
