import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BreakExclusionService } from './break-exclusion.service';
import { BreakExclusion } from './entities/break-exclusion.entity';

describe('BreakExclusionService', () => {
  let service: BreakExclusionService;

  const mockQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
  };

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softRemove: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQb),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Réinitialise le chaînage après clearAllMocks
    mockQb.where.mockReturnThis();
    mockQb.andWhere.mockReturnThis();
    mockRepo.createQueryBuilder.mockReturnValue(mockQb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreakExclusionService,
        { provide: getRepositoryToken(BreakExclusion), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<BreakExclusionService>(BreakExclusionService);
  });

  // ─── isExcluded ──────────────────────────────────────────────────────────────

  describe('isExcluded', () => {
    it('retourne true si une exclusion scope=commercial correspond au commercialId', async () => {
      mockQb.getCount.mockResolvedValue(1);

      await expect(service.isExcluded('comm-1', 'poste-1', 'sg-1')).resolves.toBe(true);
    });

    it('retourne true si une exclusion scope=poste correspond au posteId', async () => {
      mockQb.getCount.mockResolvedValue(1);

      await expect(service.isExcluded('comm-2', 'poste-1', 'sg-1')).resolves.toBe(true);
    });

    it('retourne false si aucune exclusion ne correspond', async () => {
      mockQb.getCount.mockResolvedValue(0);

      await expect(service.isExcluded('comm-99', 'poste-99', 'sg-1')).resolves.toBe(false);
    });

    it('retourne false si posteId est une chaîne vide (pas de poste assigné)', async () => {
      mockQb.getCount.mockResolvedValue(0);

      await expect(service.isExcluded('comm-1', '', 'sg-1')).resolves.toBe(false);
    });

    it('construit le QueryBuilder avec le subGroupId correct', async () => {
      mockQb.getCount.mockResolvedValue(0);

      await service.isExcluded('comm-1', 'poste-1', 'sg-42');

      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('e');
      expect(mockQb.where).toHaveBeenCalledWith('e.subGroupId = :subGroupId', { subGroupId: 'sg-42' });
    });

    it('filtre les exclusions supprimées (deletedAt IS NULL)', async () => {
      mockQb.getCount.mockResolvedValue(0);

      await service.isExcluded('comm-1', 'poste-1', 'sg-1');

      const andWhereCalls = mockQb.andWhere.mock.calls as [string, ...unknown[]][];
      const hasDeletedAtFilter = andWhereCalls.some(
        ([clause]) => typeof clause === 'string' && clause.includes('deletedAt IS NULL'),
      );
      expect(hasDeletedAtFilter).toBe(true);
    });
  });
});
