/**
 * P3.5 — Tests unitaires GdprOptoutService
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { GdprOptoutService } from '../gdpr-optout.service';
import { GdprOptout, OptOutReason } from '../entities/gdpr-optout.entity';

const makeRepo = () => ({
  create: jest.fn((dto) => ({ ...dto })),
  save: jest.fn(async (e) => ({ id: 'opt-1', ...e })),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
  update: jest.fn().mockResolvedValue(undefined),
});

describe('GdprOptoutService (P3.5)', () => {
  let service: GdprOptoutService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GdprOptoutService,
        { provide: getRepositoryToken(GdprOptout), useValue: repo },
      ],
    }).compile();

    service = module.get(GdprOptoutService);
    jest.clearAllMocks();
  });

  it('register crée un opt-out si inexistant', async () => {
    repo.findOne.mockResolvedValue(null);
    const dto = {
      tenant_id: 't-1',
      phone_number: '+33612345678',
      reason: OptOutReason.USER_REQUEST,
    };
    const result = await service.register(dto);
    expect(repo.save).toHaveBeenCalled();
    expect(result.id).toBe('opt-1');
  });

  it('register est idempotent si opt-out déjà actif', async () => {
    const existing = { id: 'opt-existing', phone_number: '+33612345678' } as GdprOptout;
    repo.findOne.mockResolvedValue(existing);
    const result = await service.register({ tenant_id: 't-1', phone_number: '+33612345678' });
    expect(repo.save).not.toHaveBeenCalled();
    expect(result.id).toBe('opt-existing');
  });

  it('isOptedOut retourne true si opt-out actif', async () => {
    repo.count.mockResolvedValue(1);
    expect(await service.isOptedOut('t-1', '+33612345678')).toBe(true);
  });

  it('isOptedOut retourne false si pas d\'opt-out', async () => {
    repo.count.mockResolvedValue(0);
    expect(await service.isOptedOut('t-1', '+33600000000')).toBe(false);
  });

  it('revoke met à jour revoked_at et revoked_by', async () => {
    const entity = {
      id: 'opt-1',
      revoked_at: null,
      revoked_by: null,
    } as any;
    repo.findOne.mockResolvedValue(entity);
    await service.revoke('t-1', '+33612345678', 'admin-1');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ revoked_by: 'admin-1' }),
    );
  });

  it('revoke lève NotFoundException si aucun opt-out actif', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.revoke('t-1', '+33612345678', 'admin')).rejects.toThrow(NotFoundException);
  });

  it('anonymize remplace le numéro par un token opaque', async () => {
    const entity = { id: 'opt-1', phone_number: '+33612345678' } as GdprOptout;
    repo.findOne.mockResolvedValue(entity);
    await service.anonymize('t-1', '+33612345678');
    expect(repo.update).toHaveBeenCalledWith(
      'opt-1',
      expect.objectContaining({
        phone_number: expect.stringContaining('ANONYMIZED_'),
      }),
    );
  });

  it('anonymize ne fait rien si le numéro est introuvable', async () => {
    repo.findOne.mockResolvedValue(null);
    await service.anonymize('t-1', '+33699999999');
    expect(repo.update).not.toHaveBeenCalled();
  });
});
