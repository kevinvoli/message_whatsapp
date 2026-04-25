import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConversationClosureService, ClosureBlockCode } from '../conversation-closure.service';
import { WhatsappChat, WhatsappChatStatus, ConversationResult } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ConversationReport, NextAction } from 'src/gicop-report/entities/conversation-report.entity';
import { FollowUp, FollowUpStatus, FollowUpType } from 'src/follow-up/entities/follow_up.entity';
import { ClosureAttemptLog } from '../entities/closure-attempt-log.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return Object.assign(new WhatsappChat(), {
    id:                  'chat-uuid-1',
    chat_id:             'chat-1',
    status:              WhatsappChatStatus.ACTIF,
    conversation_result: ConversationResult.COMMANDE_CONFIRMEE,
    ...overrides,
  });
}

function makeReport(overrides: Partial<ConversationReport> = {}): ConversationReport {
  return Object.assign(new ConversationReport(), {
    chatId:     'chat-1',
    isComplete: true,
    nextAction: NextAction.RELANCER,
    ...overrides,
  });
}

function makeFollowUp(overrides: Partial<FollowUp> = {}): FollowUp {
  return Object.assign(new FollowUp(), {
    id:              'fu-1',
    conversation_id: 'chat-uuid-1',
    status:          FollowUpStatus.PLANIFIEE,
    type:            FollowUpType.RAPPEL,
    scheduled_at:    new Date(),
    ...overrides,
  });
}

// ─── Mock repos ───────────────────────────────────────────────────────────────

function makeChatRepo(chat: WhatsappChat | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(chat),
    update:  jest.fn().mockResolvedValue({ affected: 1 }),
  } as any;
}

function makeReportRepo(report: ConversationReport | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(report),
  } as any;
}

function makeFollowUpRepo(followUp: FollowUp | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(followUp),
  } as any;
}

function makeLogRepo() {
  return {
    save:   jest.fn().mockResolvedValue({}),
    create: jest.fn().mockImplementation((d) => d),
    find:   jest.fn().mockResolvedValue([]),
  } as any;
}

function makeEmitter() {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}

function buildService(
  chatRepo   = makeChatRepo(makeChat()),
  reportRepo = makeReportRepo(makeReport()),
  followRepo = makeFollowUpRepo(makeFollowUp()),
  logRepo    = makeLogRepo(),
  emitter    = makeEmitter(),
): ConversationClosureService {
  return new ConversationClosureService(chatRepo, reportRepo, followRepo, logRepo, emitter);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConversationClosureService', () => {

  describe('validateClosure', () => {

    it('retourne ok=true si toutes les conditions sont remplies', async () => {
      const svc = buildService();
      const result = await svc.validateClosure('chat-1', 'commercial-1', false);
      expect(result.ok).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('bloque si le rapport est incomplet', async () => {
      const svc = buildService(
        makeChatRepo(makeChat()),
        makeReportRepo(makeReport({ isComplete: false })),
      );
      const result = await svc.validateClosure('chat-1', 'commercial-1', false);
      const codes = result.blockers.map((b) => b.code);
      expect(codes).toContain(ClosureBlockCode.RAPPORT_INCOMPLET);
      expect(result.ok).toBe(false);
    });

    it('bloque si le rapport est absent', async () => {
      const svc = buildService(
        makeChatRepo(makeChat()),
        makeReportRepo(null),
      );
      const result = await svc.validateClosure('chat-1', 'commercial-1', false);
      expect(result.blockers.some((b) => b.code === ClosureBlockCode.RAPPORT_INCOMPLET)).toBe(true);
    });

    it('bloque si le résultat de conversation est absent', async () => {
      const svc = buildService(
        makeChatRepo(makeChat({ conversation_result: null as any })),
        makeReportRepo(makeReport()),
      );
      const result = await svc.validateClosure('chat-1', 'commercial-1', false);
      expect(result.blockers.some((b) => b.code === ClosureBlockCode.RESULTAT_MANQUANT)).toBe(true);
    });

    it('bloque si la prochaine action est absente', async () => {
      const svc = buildService(
        makeChatRepo(makeChat()),
        makeReportRepo(makeReport({ nextAction: null as any })),
        makeFollowUpRepo(null),
      );
      const result = await svc.validateClosure('chat-1', 'commercial-1', false);
      expect(result.blockers.some((b) => b.code === ClosureBlockCode.PROCHAINE_ACTION_MANQUANTE)).toBe(true);
    });

    it('bloque si nextAction=relancer sans relance planifiée', async () => {
      const svc = buildService(
        makeChatRepo(makeChat()),
        makeReportRepo(makeReport({ nextAction: NextAction.RELANCER })),
        makeFollowUpRepo(null),
      );
      const result = await svc.validateClosure('chat-1', 'commercial-1', false);
      expect(result.blockers.some((b) => b.code === ClosureBlockCode.RELANCE_REQUISE)).toBe(true);
    });

    it('ne bloque pas si nextAction=relancer avec relance planifiée', async () => {
      const svc = buildService(
        makeChatRepo(makeChat()),
        makeReportRepo(makeReport({ nextAction: NextAction.RELANCER })),
        makeFollowUpRepo(makeFollowUp()),
      );
      const result = await svc.validateClosure('chat-1', 'commercial-1', false);
      expect(result.blockers.some((b) => b.code === ClosureBlockCode.RELANCE_REQUISE)).toBe(false);
    });

    it('peut cumuler plusieurs blocages', async () => {
      const svc = buildService(
        makeChatRepo(makeChat({ conversation_result: null as any })),
        makeReportRepo(makeReport({ isComplete: false, nextAction: null as any })),
        makeFollowUpRepo(null),
      );
      const result = await svc.validateClosure('chat-1', 'commercial-1', false);
      expect(result.blockers.length).toBeGreaterThanOrEqual(2);
      expect(result.ok).toBe(false);
    });
  });

  describe('closeConversation', () => {

    it('lève BadRequestException si les conditions ne sont pas remplies', async () => {
      const svc = buildService(
        makeChatRepo(makeChat()),
        makeReportRepo(makeReport({ isComplete: false })),
      );
      await expect(svc.closeConversation('chat-1', 'commercial-1'))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('met à jour le statut et émet conversation.closed si ok', async () => {
      const chatRepo = makeChatRepo(makeChat());
      const emitter  = makeEmitter();
      const svc = buildService(chatRepo, makeReportRepo(makeReport()), makeFollowUpRepo(makeFollowUp()), makeLogRepo(), emitter);

      const result = await svc.closeConversation('chat-1', 'commercial-1');
      expect(result.ok).toBe(true);
      expect(chatRepo.update).toHaveBeenCalledWith(
        { chat_id: 'chat-1' },
        { status: WhatsappChatStatus.FERME },
      );
      expect(emitter.emit).toHaveBeenCalledWith('conversation.closed', expect.objectContaining({
        chatId:       'chat-1',
        commercialId: 'commercial-1',
      }));
    });
  });

  describe('isAlreadyClosed', () => {

    it('retourne true si la conversation est fermée', async () => {
      const svc = buildService(makeChatRepo(makeChat({ status: WhatsappChatStatus.FERME })));
      expect(await svc.isAlreadyClosed('chat-1')).toBe(true);
    });

    it('retourne false si la conversation est active', async () => {
      const svc = buildService(makeChatRepo(makeChat({ status: WhatsappChatStatus.ACTIF })));
      expect(await svc.isAlreadyClosed('chat-1')).toBe(false);
    });
  });
});
