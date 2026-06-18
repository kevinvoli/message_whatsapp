import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReadOnlyEnforcementJob } from './read-only-enforcement.job';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ChatSessionService } from 'src/chat-session/chat-session.service';
import { ChannelService } from 'src/channel/channel.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { AppLogger } from 'src/logging/app-logger.service';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { mockRepository } from '../../test/helpers/mock-repository';
import { makeConversation } from '../../test/factories/conversation.factory';

describe('ReadOnlyEnforcementJob', () => {
  let job: ReadOnlyEnforcementJob;

  const chatRepo = mockRepository<WhatsappChat>();

  const gateway = { emitConversationClosed: jest.fn() };
  const cronConfigService = { registerHandler: jest.fn(), registerPreviewHandler: jest.fn() };
  const channelService = { getChannelIdsToSkipAutoClose: jest.fn() };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const chatSessionService = { closeExpiredChatByWindowExpiry: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadOnlyEnforcementJob,
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepo },
        { provide: WhatsappMessageGateway, useValue: gateway },
        { provide: CronConfigService, useValue: cronConfigService },
        { provide: ChannelService, useValue: channelService },
        { provide: AppLogger, useValue: logger },
        { provide: ChatSessionService, useValue: chatSessionService },
      ],
    }).compile();

    job = module.get<ReadOnlyEnforcementJob>(ReadOnlyEnforcementJob);

    channelService.getChannelIdsToSkipAutoClose.mockResolvedValue(new Set<string>());
    chatSessionService.closeExpiredChatByWindowExpiry.mockResolvedValue(undefined);
    gateway.emitConversationClosed.mockResolvedValue(undefined);
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function spyExplicit(chats: WhatsappChat[]): jest.SpyInstance {
    return jest
      .spyOn(job as unknown as { findExplicitlyExpiredChats(): Promise<WhatsappChat[]> }, 'findExplicitlyExpiredChats')
      .mockResolvedValue(chats);
  }

  function spyOrphaned(chats: WhatsappChat[]): jest.SpyInstance {
    return jest
      .spyOn(job as unknown as { findOrphanedExpiredChats(): Promise<WhatsappChat[]> }, 'findOrphanedExpiredChats')
      .mockResolvedValue(chats);
  }

  // ── enforce() — fermeture des conversations explicitement expirées ────────────

  describe('Conversations avec windowExpiresAt expiré (cas normal)', () => {
    it('ferme une conversation dont windowExpiresAt est dans le passé', async () => {
      const chat = makeConversation({ id: 'chat-1', windowExpiresAt: new Date(Date.now() - 3_600_000) });
      spyExplicit([chat]);
      spyOrphaned([]);

      const result = await job.enforce();

      expect(chatSessionService.closeExpiredChatByWindowExpiry).toHaveBeenCalledWith('chat-1');
      expect(gateway.emitConversationClosed).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-1', status: WhatsappChatStatus.FERME }));
      expect(result).toContain('1 conversation(s) fermée(s)');
    });

    it('ne ferme pas une conversation dont windowExpiresAt est dans le futur', async () => {
      spyExplicit([]);
      spyOrphaned([]);

      const result = await job.enforce();

      expect(chatSessionService.closeExpiredChatByWindowExpiry).not.toHaveBeenCalled();
      expect(result).toContain('0 conversation(s)');
    });
  });

  // ── enforce() — fermeture des orphelins (windowExpiresAt = NULL) ──────────────

  describe('Conversations orphelines (windowExpiresAt = NULL)', () => {
    it('ferme un orphelin dont last_client_message_at date de plus de 24h', async () => {
      const old = new Date(Date.now() - 30 * 3_600_000); // -30h
      const chat = makeConversation({ id: 'chat-orphan-1', windowExpiresAt: null, last_client_message_at: old });
      spyExplicit([]);
      spyOrphaned([chat]);

      const result = await job.enforce();

      expect(chatSessionService.closeExpiredChatByWindowExpiry).toHaveBeenCalledWith('chat-orphan-1');
      expect(result).toContain('1 conversation(s) fermée(s)');
    });

    it('ferme un orphelin dont last_client_message_at est NULL', async () => {
      const chat = makeConversation({ id: 'chat-orphan-2', windowExpiresAt: null, last_client_message_at: null });
      spyExplicit([]);
      spyOrphaned([chat]);

      const result = await job.enforce();

      expect(chatSessionService.closeExpiredChatByWindowExpiry).toHaveBeenCalledWith('chat-orphan-2');
      expect(result).toContain('1 conversation(s) fermée(s)');
    });

    it('ne ferme pas un orphelin dont last_client_message_at date de moins de 24h (session valide possible)', async () => {
      // findOrphanedExpiredChats() exclut ce cas via NOT EXISTS — simulé par mock retournant []
      spyExplicit([]);
      spyOrphaned([]);

      const result = await job.enforce();

      expect(chatSessionService.closeExpiredChatByWindowExpiry).not.toHaveBeenCalled();
      expect(result).toContain('0 conversation(s)');
    });

    it('déduplique quand le même chat apparaît dans explicit et orphaned', async () => {
      const chat = makeConversation({ id: 'chat-dup', windowExpiresAt: new Date(Date.now() - 1000) });
      spyExplicit([chat]);
      spyOrphaned([chat]);

      await job.enforce();

      expect(chatSessionService.closeExpiredChatByWindowExpiry).toHaveBeenCalledTimes(1);
    });
  });

  // ── enforce() — skip canal dédié (batch) ─────────────────────────────────────

  describe('Skip canal dédié — batch getChannelIdsToSkipAutoClose', () => {
    it('saute les conversations dont le canal est dans le skipSet', async () => {
      const chat = makeConversation({ id: 'chat-skip', channel_id: 'ch-dedicated' });
      spyExplicit([chat]);
      spyOrphaned([]);
      channelService.getChannelIdsToSkipAutoClose.mockResolvedValue(new Set(['ch-dedicated']));

      const result = await job.enforce();

      expect(chatSessionService.closeExpiredChatByWindowExpiry).not.toHaveBeenCalled();
      expect(result).toContain('ignorée(s)');
    });

    it('appelle getChannelIdsToSkipAutoClose une seule fois pour 5 chats (pas de N+1)', async () => {
      const chats = Array.from({ length: 5 }, (_, i) =>
        makeConversation({ id: `chat-${i}`, channel_id: `ch-${i}` }),
      );
      spyExplicit(chats);
      spyOrphaned([]);

      await job.enforce();

      expect(channelService.getChannelIdsToSkipAutoClose).toHaveBeenCalledTimes(1);
      expect(channelService.getChannelIdsToSkipAutoClose).toHaveBeenCalledWith(
        expect.arrayContaining(['ch-0', 'ch-1', 'ch-2', 'ch-3', 'ch-4']),
      );
    });
  });

  // ── enforce() — résilience aux erreurs individuelles ─────────────────────────

  describe('Résilience aux erreurs individuelles', () => {
    it('continue le batch si closeExpiredChatByWindowExpiry échoue sur un chat', async () => {
      const chat1 = makeConversation({ id: 'chat-ok-1' });
      const chat2 = makeConversation({ id: 'chat-fail' });
      const chat3 = makeConversation({ id: 'chat-ok-2' });
      spyExplicit([chat1, chat2, chat3]);
      spyOrphaned([]);

      chatSessionService.closeExpiredChatByWindowExpiry
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('DB timeout'))
        .mockResolvedValueOnce(undefined);

      const result = await job.enforce();

      expect(chatSessionService.closeExpiredChatByWindowExpiry).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('chat-fail'),
        ReadOnlyEnforcementJob.name,
      );
      expect(result).toContain('2 conversation(s) fermée(s)');
      expect(result).toContain('[1 erreur(s)]');
    });
  });

  // ── enforce() — log STALLED ───────────────────────────────────────────────────

  describe('Log READ_ONLY_ENFORCE_STALLED', () => {
    it('loggue un warn STALLED après 3 cycles consécutifs candidates>0 / closed=0', async () => {
      const chat = makeConversation({ id: 'chat-stalled', channel_id: 'ch-skip' });
      spyExplicit([chat]);
      spyOrphaned([]);
      channelService.getChannelIdsToSkipAutoClose.mockResolvedValue(new Set(['ch-skip']));

      await job.enforce();
      await job.enforce();
      await job.enforce();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('READ_ONLY_ENFORCE_STALLED'),
        ReadOnlyEnforcementJob.name,
      );
    });

    it('réinitialise le compteur dès qu\'un cycle ferme au moins une conversation', async () => {
      const chatSkip = makeConversation({ id: 'chat-s', channel_id: 'ch-skip' });
      const chatClose = makeConversation({ id: 'chat-c' });

      jest.spyOn(job as unknown as { findExplicitlyExpiredChats(): Promise<WhatsappChat[]> }, 'findExplicitlyExpiredChats')
        .mockResolvedValue([chatSkip, chatClose]);
      jest.spyOn(job as unknown as { findOrphanedExpiredChats(): Promise<WhatsappChat[]> }, 'findOrphanedExpiredChats')
        .mockResolvedValue([]);

      channelService.getChannelIdsToSkipAutoClose
        .mockResolvedValueOnce(new Set(['ch-skip']))  // cycle 1 : skip chat-s, ferme chat-c → reset
        .mockResolvedValue(new Set(['ch-skip']));     // cycles suivants

      await job.enforce(); // closed=1 → reset
      await job.enforce(); // closed=1 → reset
      await job.enforce(); // closed=1 → reset

      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('READ_ONLY_ENFORCE_STALLED'),
        expect.anything(),
      );
    });
  });
});
