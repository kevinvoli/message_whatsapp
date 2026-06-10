import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CallLogService } from './call_log.service';
import { CallLog, CallOutcome } from './entities/call_log.entity';
import { CallStatus } from 'src/contact/entities/contact.entity';
import { createTestingModule } from '../../test/helpers/create-test-module';
import { mockRepository } from '../../test/helpers/mock-repository';
import type { MockRepository } from '../../test/helpers/mock-repository';
import type { CreateCallLogDto } from './dto/create-call-log.dto';

// ─── Factory locale ───────────────────────────────────────────────────────────

function makeCallLog(overrides: Partial<CallLog> = {}): CallLog {
  const now = new Date('2026-06-10T10:00:00.000Z');
  return {
    id: 'calllog-uuid-001',
    contact_id: 'contact-uuid-001',
    commercial_id: 'commercial-uuid-001',
    commercial_name: 'Jean Dupont',
    called_at: now,
    call_status: CallStatus.Appelé,
    outcome: CallOutcome.Répondu,
    duration_sec: 120,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCreateDto(overrides: Partial<CreateCallLogDto> = {}): CreateCallLogDto {
  return {
    contact_id: 'contact-uuid-001',
    commercial_id: 'commercial-uuid-001',
    commercial_name: 'Jean Dupont',
    call_status: CallStatus.Appelé,
    outcome: CallOutcome.Répondu,
    duration_sec: 120,
    notes: undefined,
    called_at: undefined,
    ...overrides,
  };
}

// ─── Suite principale ─────────────────────────────────────────────────────────

describe('CallLogService', () => {
  let service: CallLogService;
  let repo: MockRepository<CallLog>;

  beforeEach(async () => {
    jest.clearAllMocks();

    repo = mockRepository<CallLog>();

    const module = await createTestingModule([
      CallLogService,
      { provide: getRepositoryToken(CallLog), useValue: repo },
    ]);

    service = module.get<CallLogService>(CallLogService);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('cas nominal : crée et sauvegarde un CallLog, retourne le contrat complet', async () => {
      const dto = makeCreateDto();
      const created = makeCallLog();
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('contact_id', 'contact-uuid-001');
      expect(result).toHaveProperty('commercial_id', 'commercial-uuid-001');
      expect(result).toHaveProperty('called_at');
      expect(result.called_at).toBeInstanceOf(Date);
    });

    it('called_at absent dans le DTO → valeur défaut NOW() injectée', async () => {
      const dto = makeCreateDto({ called_at: undefined });
      const before = new Date();
      const created = makeCallLog({ called_at: new Date() });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create(dto);

      const after = new Date();
      expect(result.called_at.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(result.called_at.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('called_at fourni dans le DTO → valeur conservée telle quelle', async () => {
      const specificDate = new Date('2026-01-15T08:30:00.000Z');
      const dto = makeCreateDto({ called_at: specificDate });
      const created = makeCallLog({ called_at: specificDate });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(result.called_at.toISOString()).toBe(specificDate.toISOString());
    });

    it('idempotence : appeler create deux fois avec le même DTO → deux enregistrements distincts (pas de déduplication)', async () => {
      const dto = makeCreateDto();
      const log1 = makeCallLog({ id: 'calllog-uuid-001' });
      const log2 = makeCallLog({ id: 'calllog-uuid-002' });
      repo.create
        .mockReturnValueOnce(log1)
        .mockReturnValueOnce(log2);
      repo.save
        .mockResolvedValueOnce(log1)
        .mockResolvedValueOnce(log2);

      const first = await service.create(dto);
      const second = await service.create(dto);

      // CallLog n'est pas idempotent par design — chaque appel téléphonique est un événement distinct
      expect(repo.save).toHaveBeenCalledTimes(2);
      expect(first.id).not.toBe(second.id);
    });
  });

  // ─── findByContactId ──────────────────────────────────────────────────────

  describe('findByContactId', () => {
    it('cas nominal : retourne les logs triés par date décroissante', async () => {
      const logs = [
        makeCallLog({ id: 'log-002', called_at: new Date('2026-06-10') }),
        makeCallLog({ id: 'log-001', called_at: new Date('2026-06-09') }),
      ];
      repo.find.mockResolvedValue(logs);

      const result = await service.findByContactId('contact-uuid-001');

      expect(repo.find).toHaveBeenCalledWith({
        where: { contact_id: 'contact-uuid-001' },
        order: { called_at: 'DESC' },
      });
      expect(result).toHaveLength(2);
    });

    it('contact sans appels → retourne un tableau vide', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.findByContactId('contact-inexistant');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('pas de N+1 : un seul appel find pour un contact donné', async () => {
      repo.find.mockResolvedValue([makeCallLog()]);

      await service.findByContactId('contact-uuid-001');

      expect(repo.find).toHaveBeenCalledTimes(1);
    });
  });

  // ─── findByCommercialId ───────────────────────────────────────────────────

  describe('findByCommercialId', () => {
    it('cas nominal : retourne les logs du commercial triés par date décroissante', async () => {
      const logs = [makeCallLog(), makeCallLog({ id: 'log-002' })];
      repo.find.mockResolvedValue(logs);

      const result = await service.findByCommercialId('commercial-uuid-001');

      expect(repo.find).toHaveBeenCalledWith({
        where: { commercial_id: 'commercial-uuid-001' },
        order: { called_at: 'DESC' },
      });
      expect(result).toHaveLength(2);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('cas nominal : met à jour les champs fournis et retourne le contrat complet', async () => {
      const existing = makeCallLog();
      const updated = makeCallLog({ notes: 'Client rappelé avec succès', outcome: CallOutcome.Répondu });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('calllog-uuid-001', { notes: 'Client rappelé avec succès' });

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'calllog-uuid-001' } });
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('notes', 'Client rappelé avec succès');
    });

    it('callLog inexistant → lève NotFoundException', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('calllog-inexistant', { notes: 'Test' }),
      ).rejects.toThrow(NotFoundException);

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('idempotence : update deux fois avec les mêmes données → save appelé deux fois (chaque appel est intentionnel)', async () => {
      const existing = makeCallLog();
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);

      await service.update('calllog-uuid-001', { notes: 'Note identique' });
      repo.findOne.mockResolvedValue(existing);
      await service.update('calllog-uuid-001', { notes: 'Note identique' });

      // update est intentionnellement non idempotent : chaque appel sauvegarde
      expect(repo.save).toHaveBeenCalledTimes(2);
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('cas nominal : supprime le log existant', async () => {
      const existing = makeCallLog();
      repo.findOne.mockResolvedValue(existing);
      repo.remove.mockResolvedValue(existing);

      await service.remove('calllog-uuid-001');

      expect(repo.remove).toHaveBeenCalledWith(existing);
    });

    it('callLog inexistant → lève NotFoundException', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove('calllog-inexistant')).rejects.toThrow(NotFoundException);

      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('idempotence : remove sur un log déjà supprimé → NotFoundException dès le second appel', async () => {
      const existing = makeCallLog();
      repo.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null);
      repo.remove.mockResolvedValue(existing);

      await service.remove('calllog-uuid-001');

      await expect(service.remove('calllog-uuid-001')).rejects.toThrow(NotFoundException);

      expect(repo.remove).toHaveBeenCalledTimes(1);
    });
  });
});
