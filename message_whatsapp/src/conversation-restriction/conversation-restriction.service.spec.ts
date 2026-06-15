/**
 * Tests unitaires — ConversationRestrictionService
 *
 * Couverture :
 *  - isWindowExpired() : un chat actif/non-read_only avec windowExpiresAt dans le
 *    passé est traité comme expiré (exclu de recordAccess et de checkRestriction).
 *  - recordAccess() : un chat à fenêtre expirée n'est pas tracé (pas de save/update).
 *  - recordAccess() : un chat à fenêtre future (ou null) reste tracé normalement.
 *  - checkRestriction() : un accès sur un chat à fenêtre expirée est filtré du
 *    candidateAccesses → n'apparaît pas dans unrespondedConversations.
 *  - checkRestriction() : un chat à fenêtre future (ou null) reste compté normalement.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConversationRestrictionService } from './conversation-restriction.service';
import { CommercialConversationAccess } from './entities/commercial-conversation-access.entity';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { mockRepository, MockQueryBuilder } from '../../test/helpers/mock-repository';
import { makeConversation } from '../../test/factories/conversation.factory';

/** Construit un accès commercial de test. */
function makeAccess(
  overrides: Partial<CommercialConversationAccess> = {},
): CommercialConversationAccess {
  return {
    id: 'access-uuid-001',
    commercialId: 'commercial-uuid-001',
    chatId: '33600000001@c.us',
    accessDate: new Date().toISOString().slice(0, 10),
    accessedAt: new Date(),
    respondedAt: null,
    responseLength: 0,
    ...overrides,
  } as CommercialConversationAccess;
}

describe('ConversationRestrictionService', () => {
  let service: ConversationRestrictionService;

  const accessRepo = mockRepository<CommercialConversationAccess>();
  const chatRepo = mockRepository<WhatsappChat>();
  const messageRepo = mockRepository<WhatsappMessage>();

  const systemConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Config par défaut : restriction activée, max=1, minChars=50
    systemConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, string | null> = {
        RESTRICTION_ENABLED: 'true',
        RESTRICTION_MAX_UNRESPONDED_CONVS: '1',
        RESTRICTION_MIN_RESPONSE_CHARS: '50',
        RESTRICTION_REQUIRE_LAST_MESSAGE_MINE: 'false',
        RESTRICTION_MIN_CHARS_SEND_ENABLED: 'false',
      };
      return Promise.resolve(values[key] ?? null);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationRestrictionService,
        { provide: getRepositoryToken(CommercialConversationAccess), useValue: accessRepo },
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepo },
        { provide: getRepositoryToken(WhatsappMessage), useValue: messageRepo },
        { provide: SystemConfigService, useValue: systemConfigService },
      ],
    }).compile();

    service = module.get<ConversationRestrictionService>(ConversationRestrictionService);
  });

  // ─── recordAccess() — fenêtre expirée ────────────────────────────────────────

  describe('recordAccess() — fenêtre WhatsApp expirée', () => {
    it('ne trace pas un chat actif/non-read_only dont windowExpiresAt est dans le passé', async () => {
      // arrange — chat actif, read_only=false, mais fenêtre expirée
      const expiredChat = makeConversation({
        chat_id: '33600000010@c.us',
        status: WhatsappChatStatus.ACTIF,
        read_only: false,
        windowExpiresAt: new Date(Date.now() - 60 * 60 * 1000), // -1h
      });
      chatRepo.findOne.mockResolvedValue(expiredChat);

      // act
      await service.recordAccess('commercial-uuid-001', '33600000010@c.us');

      // assert — aucun accès enregistré
      expect(accessRepo.findOne).not.toHaveBeenCalled();
      expect(accessRepo.save).not.toHaveBeenCalled();
      expect(accessRepo.update).not.toHaveBeenCalled();
    });

    it('trace normalement un chat actif avec windowExpiresAt dans le futur', async () => {
      // arrange
      const validChat = makeConversation({
        chat_id: '33600000011@c.us',
        status: WhatsappChatStatus.ACTIF,
        read_only: false,
        channel_id: 'channel-uuid-001',
        windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // +1h
      });
      chatRepo.findOne.mockResolvedValue(validChat);
      accessRepo.findOne.mockResolvedValue(null);
      accessRepo.create.mockImplementation((data: unknown) => data as CommercialConversationAccess);
      accessRepo.save.mockResolvedValue(makeAccess());

      // act
      await service.recordAccess('commercial-uuid-001', '33600000011@c.us');

      // assert — accès créé normalement
      expect(accessRepo.save).toHaveBeenCalledTimes(1);
    });

    it('trace normalement un chat actif avec windowExpiresAt = null', async () => {
      // arrange
      const validChat = makeConversation({
        chat_id: '33600000012@c.us',
        status: WhatsappChatStatus.ACTIF,
        read_only: false,
        channel_id: 'channel-uuid-001',
        windowExpiresAt: null,
      });
      chatRepo.findOne.mockResolvedValue(validChat);
      accessRepo.findOne.mockResolvedValue(null);
      accessRepo.create.mockImplementation((data: unknown) => data as CommercialConversationAccess);
      accessRepo.save.mockResolvedValue(makeAccess());

      // act
      await service.recordAccess('commercial-uuid-001', '33600000012@c.us');

      // assert
      expect(accessRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ─── checkRestriction() — fenêtre expirée ────────────────────────────────────

  describe('checkRestriction() — fenêtre WhatsApp expirée', () => {
    /** Construit un mock QueryBuilder retournant `result` pour getMany(). */
    function buildAccessQb(result: CommercialConversationAccess[]): MockQueryBuilder {
      const qb = accessRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue(result);
      return qb;
    }

    /** Construit un mock QueryBuilder retournant `result` pour getMany() (chats). */
    function buildChatQb(result: WhatsappChat[]): MockQueryBuilder {
      const qb = chatRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue(result);
      return qb;
    }

    /** Construit un mock QueryBuilder retournant des résultats vides pour messages. */
    function buildMessageQb(rawMany: Array<{ chatId: string }> = []): MockQueryBuilder {
      const qb = messageRepo.createQueryBuilder();
      qb.getRawMany.mockResolvedValue(rawMany);
      qb.getOne.mockResolvedValue(null);
      return qb;
    }

    it('exclut un chat à fenêtre expirée de unrespondedConversations (status actif, read_only=false)', async () => {
      // arrange — un accès non répondu sur un chat dont la fenêtre est expirée
      const expiredChat = makeConversation({
        chat_id: '33600000020@c.us',
        status: WhatsappChatStatus.ACTIF,
        read_only: false,
        channel_id: 'channel-uuid-001',
        windowExpiresAt: new Date(Date.now() - 60 * 60 * 1000), // expirée
      });
      const access = makeAccess({ chatId: '33600000020@c.us' });

      accessRepo.createQueryBuilder.mockReturnValue(
        buildAccessQb([access]) as ReturnType<typeof accessRepo.createQueryBuilder>,
      );
      chatRepo.createQueryBuilder.mockReturnValue(
        buildChatQb([expiredChat]) as ReturnType<typeof chatRepo.createQueryBuilder>,
      );
      messageRepo.createQueryBuilder.mockReturnValue(
        buildMessageQb([]) as ReturnType<typeof messageRepo.createQueryBuilder>,
      );

      // act
      const result = await service.checkRestriction('commercial-uuid-001');

      // assert — le chat à fenêtre expirée est filtré, ne compte pas
      expect(result.unrespondedCount).toBe(0);
      expect(result.unrespondedConversations).toHaveLength(0);
      expect(result.triggered).toBe(false);
    });

    it('compte normalement un chat à fenêtre future dans unrespondedConversations', async () => {
      // arrange
      const validChat = makeConversation({
        chat_id: '33600000021@c.us',
        status: WhatsappChatStatus.ACTIF,
        read_only: false,
        channel_id: 'channel-uuid-001',
        windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // future
      });
      const access = makeAccess({ chatId: '33600000021@c.us' });

      accessRepo.createQueryBuilder.mockReturnValue(
        buildAccessQb([access]) as ReturnType<typeof accessRepo.createQueryBuilder>,
      );
      chatRepo.createQueryBuilder.mockReturnValue(
        buildChatQb([validChat]) as ReturnType<typeof chatRepo.createQueryBuilder>,
      );
      messageRepo.createQueryBuilder.mockReturnValue(
        buildMessageQb([]) as ReturnType<typeof messageRepo.createQueryBuilder>,
      );

      // act
      const result = await service.checkRestriction('commercial-uuid-001');

      // assert — la conversation est comptée
      expect(result.unrespondedCount).toBe(1);
      expect(result.unrespondedConversations[0].chat_id).toBe('33600000021@c.us');
    });

    it('compte normalement un chat avec windowExpiresAt = null', async () => {
      // arrange
      const validChat = makeConversation({
        chat_id: '33600000022@c.us',
        status: WhatsappChatStatus.ACTIF,
        read_only: false,
        channel_id: 'channel-uuid-001',
        windowExpiresAt: null,
      });
      const access = makeAccess({ chatId: '33600000022@c.us' });

      accessRepo.createQueryBuilder.mockReturnValue(
        buildAccessQb([access]) as ReturnType<typeof accessRepo.createQueryBuilder>,
      );
      chatRepo.createQueryBuilder.mockReturnValue(
        buildChatQb([validChat]) as ReturnType<typeof chatRepo.createQueryBuilder>,
      );
      messageRepo.createQueryBuilder.mockReturnValue(
        buildMessageQb([]) as ReturnType<typeof messageRepo.createQueryBuilder>,
      );

      // act
      const result = await service.checkRestriction('commercial-uuid-001');

      // assert
      expect(result.unrespondedCount).toBe(1);
    });
  });
});
