/**
 * Tests unitaires — ConversationReportService
 * REL-005 : idempotence follow-up lors de l'upsert rapport
 */
import { ConversationReportService } from '../conversation-report.service';
import { ConversationReport, NextAction } from '../entities/conversation-report.entity';

function makeReport(overrides: Partial<ConversationReport> = {}): ConversationReport {
  return Object.assign(new ConversationReport(), {
    id: 'rpt-1',
    chatId: 'chat-abc',
    isComplete: false,
    isSubmitted: false,
    isValidated: false,
    ...overrides,
  });
}

function makeReportRepo(report: ConversationReport | null = null) {
  const saved = report ?? makeReport();
  return {
    findOne: jest.fn().mockResolvedValue(report),
    create:  jest.fn().mockReturnValue(saved),
    save:    jest.fn().mockResolvedValue(saved),
    find:    jest.fn().mockResolvedValue([]),
    update:  jest.fn().mockResolvedValue({}),
  } as any;
}

function makeContactRepo(contactId: string | null = 'contact-1') {
  return {
    findOne: jest.fn().mockResolvedValue(contactId ? { id: contactId } : null),
  } as any;
}

function makeChatRepo(chatUuid: string | null = 'conv-1') {
  return {
    findOne: jest.fn().mockResolvedValue(chatUuid ? { id: chatUuid } : null),
  } as any;
}

function makeFollowUpService() {
  return {
    upsertFromDossierOrReport: jest.fn().mockResolvedValue({ followUp: {}, isNew: true }),
  } as any;
}

function buildService(overrides: {
  reportRepo?: any;
  contactRepo?: any;
  chatRepo?: any;
  followUpService?: any;
} = {}) {
  const reportRepo     = overrides.reportRepo     ?? makeReportRepo();
  const contactRepo    = overrides.contactRepo    ?? makeContactRepo();
  const chatRepo       = overrides.chatRepo       ?? makeChatRepo();
  const followUpService = overrides.followUpService ?? makeFollowUpService();

  const svc = new ConversationReportService(
    reportRepo,
    contactRepo,
    chatRepo,
    followUpService,
  );
  return { svc, reportRepo, contactRepo, chatRepo, followUpService };
}

describe('ConversationReportService.upsert', () => {
  it('sauvegarde le rapport sans followUpAt sans appeler upsertFromDossierOrReport', async () => {
    const { svc, followUpService } = buildService();

    await svc.upsert('chat-abc', { clientName: 'Jean' });

    expect(followUpService.upsertFromDossierOrReport).not.toHaveBeenCalled();
  });

  it('sauvegarde le rapport avec followUpAt sans commercialId sans créer de follow-up', async () => {
    const { svc, followUpService } = buildService();

    await svc.upsert('chat-abc', { followUpAt: '2026-05-10T09:00:00Z' });

    expect(followUpService.upsertFromDossierOrReport).not.toHaveBeenCalled();
  });

  it('REL-005 — appelle upsertFromDossierOrReport si followUpAt + commercialId', async () => {
    const { svc, followUpService } = buildService();

    await svc.upsert('chat-abc', {
      followUpAt:   '2026-05-10T09:00:00Z',
      commercialId: 'comm-1',
      nextAction:   'rappeler' as NextAction,
    });

    expect(followUpService.upsertFromDossierOrReport).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id:    'contact-1',
        conversation_id: 'conv-1',
        commercial_id: 'comm-1',
        next_action:   'rappeler',
      }),
    );
  });

  it('REL-005 — contact introuvable → contact_id = null, pas de crash', async () => {
    const { svc, followUpService } = buildService({ contactRepo: makeContactRepo(null) });

    await svc.upsert('chat-abc', {
      followUpAt:   '2026-05-10T09:00:00Z',
      commercialId: 'comm-1',
    });

    expect(followUpService.upsertFromDossierOrReport).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: null }),
    );
  });

  it('REL-005 — erreur follow-up silencieuse, rapport quand même retourné', async () => {
    const failingFollowUp = { upsertFromDossierOrReport: jest.fn().mockRejectedValue(new Error('DB down')) };
    const { svc } = buildService({ followUpService: failingFollowUp });

    const result = await svc.upsert('chat-abc', {
      followUpAt:   '2026-05-10T09:00:00Z',
      commercialId: 'comm-1',
    });

    expect(result).toBeDefined();
  });
});
