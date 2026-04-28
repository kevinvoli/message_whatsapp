/**
 * Tests unitaires — FollowUpService
 * Couvre : create, upsertFromDossierOrReport (anti-doublon), markOverdue, countOverdueByCommercial.
 */

import { FollowUpService, UpsertFollowUpPayload } from '../follow_up.service';
import { FollowUp, FollowUpStatus, FollowUpType } from '../entities/follow_up.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeFollowUp(overrides: Partial<FollowUp> = {}): FollowUp {
  return Object.assign(new FollowUp(), {
    id:              'fu-1',
    contact_id:      'contact-1',
    conversation_id: 'conv-1',
    commercial_id:   'commercial-1',
    commercial_name: 'Alice',
    type:            FollowUpType.RAPPEL,
    status:          FollowUpStatus.PLANIFIEE,
    scheduled_at:    new Date('2026-05-01T10:00:00Z'),
    notes:           null,
    ...overrides,
  });
}

// ─── Mock repo & event emitter ─────────────────────────────────────────────────

function makeRepo(existing: FollowUp | null = null) {
  const qb = {
    where:    jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne:   jest.fn().mockResolvedValue(existing),
  };
  return {
    create:             jest.fn().mockImplementation((v) => Object.assign(new FollowUp(), v)),
    save:               jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: v.id ?? 'fu-new' })),
    findOne:            jest.fn().mockResolvedValue(existing),
    find:               jest.fn().mockResolvedValue(existing ? [existing] : []),
    count:              jest.fn().mockResolvedValue(0),
    findAndCount:       jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    update:             jest.fn().mockResolvedValue({ affected: 1 }),
  } as any;
}

function makeEventEmitter() {
  return { emit: jest.fn() } as any;
}

function makeContactRepo() {
  return { find: jest.fn().mockResolvedValue([]) } as any;
}

function build(existing: FollowUp | null = null): { service: FollowUpService; repo: ReturnType<typeof makeRepo> } {
  const repo = makeRepo(existing);
  const service = new FollowUpService(repo, makeContactRepo(), makeEventEmitter());
  return { service, repo };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FollowUpService', () => {
  describe('create', () => {
    it('crée une relance et émet follow_up.created', async () => {
      const { service, repo } = build();
      const ee = (service as any).eventEmitter;
      const result = await service.create(
        { type: FollowUpType.RAPPEL, scheduled_at: '2026-05-10T09:00:00Z' },
        'commercial-1',
        'Alice',
      );
      expect(repo.save).toHaveBeenCalled();
      expect(ee.emit).toHaveBeenCalledWith('follow_up.created', expect.objectContaining({ commercialId: 'commercial-1' }));
      expect(result.status).toBe(FollowUpStatus.PLANIFIEE);
    });
  });

  describe('upsertFromDossierOrReport', () => {
    const payload: UpsertFollowUpPayload = {
      contact_id:      'contact-1',
      conversation_id: 'conv-1',
      commercial_id:   'commercial-1',
      scheduled_at:    new Date('2026-05-10T09:00:00Z'),
      next_action:     'rappeler',
      notes:           'Rappel important',
    };

    it('crée une nouvelle relance si aucune active existante (isNew=true)', async () => {
      const { service, repo } = build(null);
      const { isNew } = await service.upsertFromDossierOrReport(payload);
      expect(isNew).toBe(true);
      expect(repo.save).toHaveBeenCalled();
    });

    it('met à jour la relance existante si active (isNew=false)', async () => {
      const existing = makeFollowUp({ status: FollowUpStatus.PLANIFIEE });
      const { service, repo } = build(existing);
      const { isNew, followUp } = await service.upsertFromDossierOrReport(payload);
      expect(isNew).toBe(false);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'fu-1' }));
      expect(followUp.scheduled_at).toEqual(payload.scheduled_at);
    });

    it('met à jour une relance EN_RETARD existante (isNew=false)', async () => {
      const existing = makeFollowUp({ status: FollowUpStatus.EN_RETARD });
      const { service } = build(existing);
      const { isNew } = await service.upsertFromDossierOrReport(payload);
      expect(isNew).toBe(false);
    });

    it('mappe next_action=rappeler → type RAPPEL', async () => {
      const { service, repo } = build(null);
      await service.upsertFromDossierOrReport({ ...payload, next_action: 'rappeler' });
      const saved = repo.save.mock.calls[0][0] as FollowUp;
      expect(saved.type).toBe(FollowUpType.RAPPEL);
    });

    it('mappe next_action=relancer → type RELANCE_POST_CONVERSATION', async () => {
      const { service, repo } = build(null);
      await service.upsertFromDossierOrReport({ ...payload, next_action: 'relancer' });
      const saved = repo.save.mock.calls[0][0] as FollowUp;
      expect(saved.type).toBe(FollowUpType.RELANCE_POST_CONVERSATION);
    });

    it('next_action inconnu → type RAPPEL par défaut', async () => {
      const { service, repo } = build(null);
      await service.upsertFromDossierOrReport({ ...payload, next_action: 'inconnu' });
      const saved = repo.save.mock.calls[0][0] as FollowUp;
      expect(saved.type).toBe(FollowUpType.RAPPEL);
    });

    it('émet follow_up.created seulement pour une nouvelle relance', async () => {
      const { service } = build(null);
      const ee = (service as any).eventEmitter;
      await service.upsertFromDossierOrReport(payload);
      expect(ee.emit).toHaveBeenCalledWith('follow_up.created', expect.any(Object));
    });

    it('ne réémet pas follow_up.created pour une mise à jour', async () => {
      const existing = makeFollowUp();
      const { service } = build(existing);
      const ee = (service as any).eventEmitter;
      await service.upsertFromDossierOrReport(payload);
      expect(ee.emit).not.toHaveBeenCalled();
    });
  });

  describe('countOverdueByCommercial', () => {
    it('retourne le count depuis le repo', async () => {
      const { service, repo } = build();
      repo.count.mockResolvedValue(3);
      const count = await service.countOverdueByCommercial('commercial-1');
      expect(count).toBe(3);
    });
  });
});
