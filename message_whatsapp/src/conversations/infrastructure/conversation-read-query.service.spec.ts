/**
 * TICKET-06-B — Tests unitaires de ConversationReadQueryService.
 *
 * On vérifie que les méthodes de lecture délèguent correctement
 * aux repositories et retournent les données attendues.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ConversationReadQueryService } from './conversation-read-query.service';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

const makeQb = (result: any) => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  leftJoinAndMapOne: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  addGroupBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(result ?? []),
  getManyAndCount: jest.fn().mockResolvedValue([result ?? [], 0]),
  getOne: jest.fn().mockResolvedValue(result ?? null),
  getRawOne: jest.fn().mockResolvedValue(result ?? null),
  getRawMany: jest.fn().mockResolvedValue(result ?? []),
});

describe('ConversationReadQueryService', () => {
  let service: ConversationReadQueryService;

  const chatRepository = { createQueryBuilder: jest.fn(), find: jest.fn() };
  const messageRepository = { createQueryBuilder: jest.fn() };
  const posteRepository = { find: jest.fn() };
  const commercialRepository = { find: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationReadQueryService,
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepository },
        { provide: getRepositoryToken(WhatsappMessage), useValue: messageRepository },
        { provide: getRepositoryToken(WhatsappPoste), useValue: posteRepository },
        { provide: getRepositoryToken(WhatsappCommercial), useValue: commercialRepository },
      ],
    }).compile();

    service = module.get<ConversationReadQueryService>(ConversationReadQueryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findByPosteId ─────────────────────────────────────────────────────────────

  describe('findByPosteId', () => {
    it('RQ-01 : retourne les conversations et hasMore=false quand résultat ≤ limit', async () => {
      const chats = [{ chat_id: 'c1' }, { chat_id: 'c2' }] as WhatsappChat[];
      const qb = makeQb(chats);
      chatRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findByPosteId('poste-1');

      expect(result.chats).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('RQ-02 : retourne hasMore=true quand résultat > limit', async () => {
      const limit = 2;
      const chats = [{ chat_id: 'c1' }, { chat_id: 'c2' }, { chat_id: 'c3' }] as WhatsappChat[];
      const qb = makeQb(chats);
      chatRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findByPosteId('poste-1', ['fermé'], limit);

      expect(result.chats).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });
  });

  // ── getTotalUnreadForPoste ────────────────────────────────────────────────────

  describe('getTotalUnreadForPoste', () => {
    it('RQ-03 : retourne le total converti en nombre', async () => {
      const qb = makeQb({ total: '7' });
      messageRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getTotalUnreadForPoste('poste-1');

      expect(result).toBe(7);
    });

    it('RQ-04 : retourne 0 si aucun résultat', async () => {
      const qb = makeQb(null);
      messageRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getTotalUnreadForPoste('poste-1');

      expect(result).toBe(0);
    });
  });

  // ── findByChatId ──────────────────────────────────────────────────────────────

  describe('findByChatId', () => {
    it('RQ-05 : retourne la conversation quand trouvée', async () => {
      const chat = { chat_id: 'chat-abc' } as WhatsappChat;
      const qb = makeQb(chat);
      chatRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findByChatId('chat-abc');

      expect(result).toBe(chat);
    });

    it('RQ-06 : retourne null si introuvable', async () => {
      const qb = makeQb(null);
      chatRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findByChatId('unknown');

      expect(result).toBeNull();
    });
  });

  // ── findBulkByChatIds ─────────────────────────────────────────────────────────

  describe('findBulkByChatIds', () => {
    it('RQ-07 : retourne une Map vide si chatIds est vide', async () => {
      const result = await service.findBulkByChatIds([]);
      expect(result.size).toBe(0);
      expect(chatRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('RQ-08 : retourne une Map indexée par chat_id', async () => {
      const chats = [
        { chat_id: 'c1' } as WhatsappChat,
        { chat_id: 'c2' } as WhatsappChat,
      ];
      const qb = makeQb(chats);
      chatRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findBulkByChatIds(['c1', 'c2']);

      expect(result.size).toBe(2);
      expect(result.get('c1')?.chat_id).toBe('c1');
      expect(result.get('c2')?.chat_id).toBe('c2');
    });
  });

  // ── getStatsByPoste ────────────────────────────────────────────────────────────

  describe('getStatsByPoste', () => {
    it('RQ-09 : calcule les stats par poste à partir des rows brutes', async () => {
      const postes = [
        { id: 'p1', name: 'Poste A', code: 'PA' } as WhatsappPoste,
      ];
      posteRepository.find.mockResolvedValue(postes);

      const rows = [
        { poste_id: 'p1', status: WhatsappChatStatus.ACTIF, count: '3', unread_sum: '5' },
        { poste_id: 'p1', status: WhatsappChatStatus.EN_ATTENTE, count: '2', unread_sum: '1' },
      ];
      const qb = makeQb(undefined);
      qb.getRawMany.mockResolvedValue(rows);
      chatRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getStatsByPoste();

      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(5);
      expect(result[0].actif).toBe(3);
      expect(result[0].en_attente).toBe(2);
      expect(result[0].unread_total).toBe(6);
    });
  });
});
