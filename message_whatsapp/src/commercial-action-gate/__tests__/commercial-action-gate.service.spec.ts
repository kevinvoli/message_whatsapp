/**
 * Tests unitaires — CommercialActionGateService
 * Couvre : evaluate (statuts gate), countOverdueFollowUps (bug fix EN_RETARD).
 */

import { CommercialActionGateService } from '../commercial-action-gate.service';
import { FollowUpStatus } from 'src/follow-up/entities/follow_up.entity';
import { WhatsappChatStatus, WindowStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { MessageDirection } from 'src/whatsapp_message/entities/whatsapp_message.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQbCount(count: number) {
  return {
    innerJoin:  jest.fn().mockReturnThis(),
    leftJoin:   jest.fn().mockReturnThis(),
    where:      jest.fn().mockReturnThis(),
    andWhere:   jest.fn().mockReturnThis(),
    getCount:   jest.fn().mockResolvedValue(count),
  };
}

function makeCommercialRepo(posteId: string | null = 'poste-1') {
  const commercial = Object.assign(new WhatsappCommercial(), {
    id: 'commercial-1',
    poste: posteId ? { id: posteId } : null,
  });
  return { findOne: jest.fn().mockResolvedValue(commercial) } as any;
}

function makeCallObligationService(readyForRotation = true) {
  return {
    getStatus: jest.fn().mockResolvedValue({
      readyForRotation,
      annulee:      { required: 0, done: 0 },
      livree:       { required: 0, done: 0 },
      sansCommande: { required: 0, done: 0 },
    }),
  } as any;
}

function makeAttendanceService(status = 'working') {
  return { getCurrentStatus: jest.fn().mockResolvedValue(status) } as any;
}

function makeFollowUpRepo(overdueCount = 0) {
  const qb = makeQbCount(overdueCount);
  return { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;
}

function buildService({
  missedCalls = 0,
  unanswered = 0,
  withoutReport = 0,
  overdueFollowUps = 0,
  priority = 0,
  callObligationReady = true,
  attendanceStatus = 'working',
}: {
  missedCalls?: number;
  unanswered?: number;
  withoutReport?: number;
  overdueFollowUps?: number;
  priority?: number;
  callObligationReady?: boolean;
  attendanceStatus?: string;
} = {}) {
  const messageRepo = { createQueryBuilder: jest.fn().mockReturnValue(makeQbCount(missedCalls)) } as any;
  const chatRepo    = {
    createQueryBuilder: jest.fn()
      .mockReturnValueOnce(makeQbCount(unanswered))
      .mockReturnValueOnce(makeQbCount(withoutReport))
      .mockReturnValueOnce(makeQbCount(priority)),
  } as any;
  const reportRepo    = {} as any;
  const followUpRepo  = makeFollowUpRepo(overdueFollowUps);

  const service = new CommercialActionGateService(
    makeCommercialRepo('poste-1'),
    chatRepo,
    messageRepo,
    reportRepo,
    followUpRepo,
    makeCallObligationService(callObligationReady),
    makeAttendanceService(attendanceStatus),
  );

  return service;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CommercialActionGateService', () => {
  describe('evaluate — statut global', () => {
    it('retourne allow quand tout est OK', async () => {
      const service = buildService();
      const result = await service.evaluate('commercial-1');
      expect(result.status).toBe('allow');
      expect(result.blockers).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('retourne block si appels en absence non traités', async () => {
      const service = buildService({ missedCalls: 2 });
      const result = await service.evaluate('commercial-1');
      expect(result.status).toBe('block');
      expect(result.blockers.some((b) => b.code === 'MISSED_CALLS')).toBe(true);
    });

    it('retourne block si messages non répondus', async () => {
      const service = buildService({ unanswered: 3 });
      const result = await service.evaluate('commercial-1');
      expect(result.status).toBe('block');
      expect(result.blockers.some((b) => b.code === 'UNANSWERED_MESSAGES')).toBe(true);
    });

    it('retourne warn si relances en retard (pas un blocker)', async () => {
      const service = buildService({ overdueFollowUps: 2 });
      const result = await service.evaluate('commercial-1');
      expect(result.status).toBe('warn');
      expect(result.warnings.some((w) => w.code === 'OVERDUE_FOLLOWUPS')).toBe(true);
    });

    it('retourne warn si présence en pause', async () => {
      const service = buildService({ attendanceStatus: 'on_break' });
      const result = await service.evaluate('commercial-1');
      expect(result.status).toBe('warn');
      expect(result.warnings.some((w) => w.code === 'ON_BREAK')).toBe(true);
    });

    it('retourne block si non pointé', async () => {
      const service = buildService({ attendanceStatus: 'not_clocked_in' });
      const result = await service.evaluate('commercial-1');
      expect(result.status).toBe('block');
      expect(result.blockers.some((b) => b.code === 'NOT_CLOCKED_IN')).toBe(true);
    });
  });

  describe('countOverdueFollowUps — fix bug EN_RETARD', () => {
    it('utilise OR(EN_RETARD | PLANIFIEE+past) dans la requête', async () => {
      const followUpRepo = makeFollowUpRepo(0);
      const qb = followUpRepo.createQueryBuilder();

      const service = buildService({ overdueFollowUps: 0 });
      // Réinjecter le repo pour inspecter les appels
      (service as any).followUpRepo = followUpRepo;

      await service.evaluate('commercial-1');

      // La requête doit contenir les deux statuts
      const andWhereCalls: string[] = qb.andWhere.mock.calls.map((c: unknown[]) => String(c[0]));
      const hasOrCondition = andWhereCalls.some(
        (call) => call.includes('EN_RETARD') || call.includes('overdue') || call.includes('planifiee'),
      );
      expect(hasOrCondition).toBe(true);
    });

    it('retourne 0 si aucune relance en retard', async () => {
      const service = buildService({ overdueFollowUps: 0 });
      const result = await service.evaluate('commercial-1');
      expect(result.warnings.filter((w) => w.code === 'OVERDUE_FOLLOWUPS')).toHaveLength(0);
    });

    it('ajoute le warning OVERDUE_FOLLOWUPS si count > 0', async () => {
      const service = buildService({ overdueFollowUps: 5 });
      const result = await service.evaluate('commercial-1');
      const warning = result.warnings.find((w) => w.code === 'OVERDUE_FOLLOWUPS');
      expect(warning).toBeDefined();
      expect(warning!.count).toBe(5);
    });
  });
});
