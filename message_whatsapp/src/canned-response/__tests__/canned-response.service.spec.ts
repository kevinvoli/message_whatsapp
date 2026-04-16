/**
 * P3.1 — Tests unitaires CannedResponseService
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CannedResponseService } from '../canned-response.service';
import { CannedResponse } from '../entities/canned-response.entity';

const makeRepo = () => ({
  create: jest.fn((dto) => ({ ...dto })),
  save: jest.fn(async (e) => ({ id: 'cr-1', ...e })),
  findOne: jest.fn(),
  softDelete: jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  }),
});

describe('CannedResponseService (P3.1)', () => {
  let service: CannedResponseService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CannedResponseService,
        { provide: getRepositoryToken(CannedResponse), useValue: repo },
      ],
    }).compile();

    service = module.get(CannedResponseService);
    jest.clearAllMocks();
  });

  it('crée une réponse prédéfinie', async () => {
    const dto = {
      tenant_id: 'tenant-1',
      shortcode: 'bonjour',
      title: 'Accueil',
      body: 'Bonjour, comment puis-je vous aider ?',
    };
    const result = await service.create(dto);
    expect(repo.create).toHaveBeenCalledWith(dto);
    expect(repo.save).toHaveBeenCalled();
    expect(result.shortcode).toBe('bonjour');
  });

  it('findOne lève NotFoundException si introuvable', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne('unknown', 'tenant-1')).rejects.toThrow(NotFoundException);
  });

  it('findOne retourne l\'entité si elle existe', async () => {
    const entity = { id: 'cr-1', tenant_id: 'tenant-1', shortcode: 'merci' } as CannedResponse;
    repo.findOne.mockResolvedValue(entity);
    const result = await service.findOne('cr-1', 'tenant-1');
    expect(result.shortcode).toBe('merci');
  });

  it('update modifie les champs et sauvegarde', async () => {
    const entity = { id: 'cr-1', tenant_id: 'tenant-1', shortcode: 'merci', body: 'old' } as CannedResponse;
    repo.findOne.mockResolvedValue(entity);
    await service.update('cr-1', 'tenant-1', { body: 'new body' });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ body: 'new body' }));
  });

  it('remove appelle softDelete', async () => {
    const entity = { id: 'cr-1', tenant_id: 'tenant-1' } as CannedResponse;
    repo.findOne.mockResolvedValue(entity);
    await service.remove('cr-1', 'tenant-1');
    expect(repo.softDelete).toHaveBeenCalledWith('cr-1');
  });

  it('suggest retourne des résultats filtrés par prefix', async () => {
    const items = [{ id: 'cr-1', shortcode: 'bonjour' }] as CannedResponse[];
    repo.createQueryBuilder().getMany.mockResolvedValue(items);
    const result = await service.suggest('tenant-1', 'bon', 'poste-1');
    expect(Array.isArray(result)).toBe(true);
  });
});
