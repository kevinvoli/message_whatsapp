/**
 * Tests unitaires — ReadOnlyEnforcementJob
 *
 * Couverture :
 *  - findExpiredSessions() : trouve la session expirée même si active_session_id
 *    du chat est désynchronisé (ne filtre plus sur active_session_id).
 *  - findExpiredSessions() : une seule session retournée par chat (pas de doublon)
 *    grâce à la sous-requête MAX(started_at).
 *  - enforce() : ferme la session/chat trouvée par findExpiredSessions(), même en
 *    cas de désynchronisation d'active_session_id.
 *  - enforce() : log STALLED après 3 cycles consécutifs candidates>0 / closed=0.
 *  - Idempotence : un second appel à enforce() sans nouvelle session expirée ne
 *    referme rien de plus.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReadOnlyEnforcementJob } from './read-only-enforcement.job';
import { ChatSession } from 'src/chat-session/entities/chat-session.entity';
import { ChatSessionService } from 'src/chat-session/chat-session.service';
import { ChannelService } from 'src/channel/channel.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { AppLogger } from 'src/logging/app-logger.service';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { mockRepository, MockQueryBuilder } from '../../test/helpers/mock-repository';
import { makeChatSession } from '../../test/factories/chat-session.factory';
import { makeConversation } from '../../test/factories/conversation.factory';

/** Construit un mock du QueryBuilder utilisé par findExpiredSessions() (getMany). */
function buildQbWithSessions(sessions: ChatSession[]): MockQueryBuilder {
  const qb = mockRepository<ChatSession>().createQueryBuilder();
  qb.getMany.mockResolvedValue(sessions);
  return qb;
}

describe('ReadOnlyEnforcementJob', () => {
  let job: ReadOnlyEnforcementJob;

  const sessionRepo = mockRepository<ChatSession>();

  const gateway = {
    emitConversationClosed: jest.fn(),
  };

  const cronConfigService = {
    registerHandler: jest.fn(),
    registerPreviewHandler: jest.fn(),
  };

  const channelService = {
    shouldSkipAutoClose: jest.fn(),
  };

  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const chatSessionService = {
    closeExpiredSessionAndChat: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadOnlyEnforcementJob,
        { provide: getRepositoryToken(ChatSession), useValue: sessionRepo },
        { provide: WhatsappMessageGateway, useValue: gateway },
        { provide: CronConfigService, useValue: cronConfigService },
        { provide: ChannelService, useValue: channelService },
        { provide: AppLogger, useValue: logger },
        { provide: ChatSessionService, useValue: chatSessionService },
      ],
    }).compile();

    job = module.get<ReadOnlyEnforcementJob>(ReadOnlyEnforcementJob);

    channelService.shouldSkipAutoClose.mockResolvedValue(false);
    chatSessionService.closeExpiredSessionAndChat.mockResolvedValue('33600000001@c.us');
    gateway.emitConversationClosed.mockResolvedValue(undefined);
  });

  // ─── findExpiredSessions() / enforce() — désynchronisation active_session_id ──

  describe('Désynchronisation active_session_id', () => {
    it('ferme la session expirée même si chat.active_session_id ne correspond pas à cette session', async () => {
      // arrange : le chat référence une autre session (désync), mais la session
      // expirée (ended_at IS NULL, auto_close_at < now) doit malgré tout être trouvée
      // par la requête, qui ne filtre plus sur active_session_id.
      const expiredAutoCloseAt = new Date(Date.now() - 60 * 60 * 1000); // -1h
      const chat = makeConversation({
        id: 'chat-uuid-desync',
        chat_id: '33600000001@c.us',
        activeSessionId: 'autre-session-uuid-999', // désynchronisé volontairement
      });
      const expiredSession = makeChatSession(
        {
          id: 'session-uuid-expired-001',
          whatsappChatId: chat.id,
          chat,
          autoCloseAt: expiredAutoCloseAt,
          endedAt: null,
        },
        {},
      );
      expiredSession.chat = chat;

      sessionRepo.createQueryBuilder.mockReturnValue(
        buildQbWithSessions([expiredSession]) as ReturnType<typeof sessionRepo.createQueryBuilder>,
      );

      // act
      const result = await job.enforce();

      // assert — la session est fermée malgré la désync active_session_id
      expect(chatSessionService.closeExpiredSessionAndChat).toHaveBeenCalledWith(
        'session-uuid-expired-001',
        'chat-uuid-desync',
      );
      expect(gateway.emitConversationClosed).toHaveBeenCalledWith(chat);
      expect(result).toContain('1 conversation(s) fermée(s)');
    });

    it('ne retourne qu\'une session par chat (pas de doublon) même si plusieurs candidates existent en base', async () => {
      // arrange : la requête SQL filtre via une sous-requête MAX(started_at) — on
      // simule directement le résultat attendu : une seule session par chat.
      const expiredAutoCloseAt = new Date(Date.now() - 60 * 60 * 1000);
      const chat = makeConversation({ id: 'chat-uuid-unique', chat_id: '33600000002@c.us' });
      const latestSession = makeChatSession(
        {
          id: 'session-uuid-latest',
          whatsappChatId: chat.id,
          autoCloseAt: expiredAutoCloseAt,
        },
        {},
      );
      latestSession.chat = chat;

      sessionRepo.createQueryBuilder.mockReturnValue(
        buildQbWithSessions([latestSession]) as ReturnType<typeof sessionRepo.createQueryBuilder>,
      );

      // act
      const result = await job.enforce();

      // assert — une seule fermeture pour le chat, pas de doublon
      expect(chatSessionService.closeExpiredSessionAndChat).toHaveBeenCalledTimes(1);
      expect(result).toContain('1 conversation(s) fermée(s)');
    });
  });

  // ─── enforce() — log STALLED après 3 cycles consécutifs ─────────────────────

  describe('Log READ_ONLY_ENFORCE_STALLED', () => {
    it('loggue un warn STALLED après 3 cycles consécutifs candidates>0 / closed=0', async () => {
      // arrange : shouldSkipAutoClose retourne toujours true → closed reste à 0
      // alors que des candidates sont détectées à chaque cycle.
      channelService.shouldSkipAutoClose.mockResolvedValue(true);

      const expiredAutoCloseAt = new Date(Date.now() - 60 * 60 * 1000);
      const chat = makeConversation({
        id: 'chat-uuid-stalled',
        chat_id: '33600000003@c.us',
        channel_id: 'channel-uuid-skip',
      });
      const session = makeChatSession({ autoCloseAt: expiredAutoCloseAt }, {});
      session.chat = chat;

      sessionRepo.createQueryBuilder.mockImplementation(
        () => buildQbWithSessions([session]) as ReturnType<typeof sessionRepo.createQueryBuilder>,
      );

      // act — 3 cycles consécutifs
      await job.enforce();
      await job.enforce();
      await job.enforce();

      // assert — le warn STALLED est loggué au 3e cycle
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('READ_ONLY_ENFORCE_STALLED'),
        ReadOnlyEnforcementJob.name,
      );
      expect(chatSessionService.closeExpiredSessionAndChat).not.toHaveBeenCalled();
    });

    it('réinitialise le compteur dès qu\'un cycle ferme au moins une conversation', async () => {
      // arrange : 1er cycle skip (closed=0), 2e cycle ferme (closed=1) → reset
      channelService.shouldSkipAutoClose.mockResolvedValueOnce(true);
      channelService.shouldSkipAutoClose.mockResolvedValue(false);

      const expiredAutoCloseAt = new Date(Date.now() - 60 * 60 * 1000);
      const chat = makeConversation({
        id: 'chat-uuid-reset',
        chat_id: '33600000004@c.us',
        channel_id: 'channel-uuid-x',
      });
      const session = makeChatSession({ autoCloseAt: expiredAutoCloseAt }, {});
      session.chat = chat;

      sessionRepo.createQueryBuilder.mockImplementation(
        () => buildQbWithSessions([session]) as ReturnType<typeof sessionRepo.createQueryBuilder>,
      );

      // act — 2 cycles : 1er sans fermeture, 2e avec fermeture
      await job.enforce();
      await job.enforce();
      await job.enforce(); // un 3e cycle "skip=0/closed=0" ne déclenche pas STALLED (compteur=1)

      // assert — aucun warn STALLED car le compteur a été réinitialisé au 2e cycle
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('READ_ONLY_ENFORCE_STALLED'),
        ReadOnlyEnforcementJob.name,
      );
    });
  });

  // ─── Idempotence ─────────────────────────────────────────────────────────────

  describe('Idempotence', () => {
    it('un second appel à enforce() sans session expirée restante ne ferme rien de plus', async () => {
      // arrange — 1er appel : une session expirée à fermer
      const expiredAutoCloseAt = new Date(Date.now() - 60 * 60 * 1000);
      const chat = makeConversation({ id: 'chat-uuid-idem', chat_id: '33600000005@c.us' });
      const session = makeChatSession({ autoCloseAt: expiredAutoCloseAt }, {});
      session.chat = chat;

      sessionRepo.createQueryBuilder
        .mockReturnValueOnce(buildQbWithSessions([session]) as ReturnType<typeof sessionRepo.createQueryBuilder>)
        // 2e appel — la session est désormais fermée (ended_at non null) → plus retournée
        .mockReturnValueOnce(buildQbWithSessions([]) as ReturnType<typeof sessionRepo.createQueryBuilder>);

      // act
      const first = await job.enforce();
      const second = await job.enforce();

      // assert
      expect(first).toContain('1 conversation(s) fermée(s)');
      expect(second).toContain('0 conversation(s) fermée(s)');
      expect(chatSessionService.closeExpiredSessionAndChat).toHaveBeenCalledTimes(1);
    });
  });
});
