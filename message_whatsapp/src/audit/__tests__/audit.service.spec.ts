import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit.service';
import { AuditLog, AuditAction } from '../entities/audit-log.entity';

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('AuditService', () => {
  let service: AuditService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(AuditService);
    repo = module.get(getRepositoryToken(AuditLog));
  });

  describe('log', () => {
    it('crée une entrée d\'audit sans lever d\'exception', async () => {
      const entry = { id: 'a1', action: AuditAction.CREATE };
      repo.create.mockReturnValue(entry);
      repo.save.mockResolvedValue(entry);

      await expect(
        service.log({ action: AuditAction.CREATE, entity_type: 'WhatsappChat', entity_id: 'c1' }),
      ).resolves.toBeUndefined();

      expect(repo.save).toHaveBeenCalledWith(entry);
    });

    it('ne lève pas d\'exception si save échoue (audit silencieux)', async () => {
      repo.create.mockReturnValue({});
      repo.save.mockRejectedValue(new Error('DB error'));

      await expect(
        service.log({ action: AuditAction.UPDATE }),
      ).resolves.toBeUndefined();
    });
  });

  describe('query', () => {
    it('applique les filtres et la pagination', async () => {
      const qb: any = {
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'a1' }], 1]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.query({ tenant_id: 't1', limit: 10, offset: 0 });
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('plafonne limit à 500', async () => {
      const qb: any = {
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.query({ limit: 9999 });
      expect(qb.take).toHaveBeenCalledWith(500);
    });
  });

  describe('getEntityHistory', () => {
    it('retourne l\'historique d\'une entité', async () => {
      const logs = [{ id: 'a1', action: AuditAction.CREATE }, { id: 'a2', action: AuditAction.UPDATE }];
      repo.find.mockResolvedValue(logs);

      const result = await service.getEntityHistory('WhatsappChat', 'chat-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('purgeOlderThan', () => {
    it('supprime les entrées anciennes et retourne le nombre affecté', async () => {
      repo.delete.mockResolvedValue({ affected: 42 });
      const result = await service.purgeOlderThan(90);
      expect(result).toBe(42);
      expect(repo.delete).toHaveBeenCalled();
    });
  });
});
