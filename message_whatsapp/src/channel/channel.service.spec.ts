import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { WhapiChannel } from './entities/channel.entity';
import { ProviderChannel } from './entities/provider-channel.entity';
import { AppLogger } from 'src/logging/app-logger.service';
import { ChannelProviderRegistry } from './domain/channel-provider.registry';
import { ResolveTenantUseCase } from './application/resolve-tenant.use-case';

describe('ChannelService', () => {
  let service: ChannelService;

  const channelRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const providerChannelRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const providerRegistry = {
    get: jest.fn(),
    has: jest.fn(),
    register: jest.fn(),
    listProviders: jest.fn(),
  };
  const resolveTenantUseCase = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelService,
        { provide: getRepositoryToken(WhapiChannel), useValue: channelRepository },
        { provide: getRepositoryToken(ProviderChannel), useValue: providerChannelRepository },
        { provide: AppLogger, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
        { provide: ChannelProviderRegistry, useValue: providerRegistry },
        { provide: ResolveTenantUseCase, useValue: resolveTenantUseCase },
      ],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── resolveTenantByProviderExternalId → ResolveTenantUseCase ──────────────

  describe('resolveTenantByProviderExternalId', () => {
    it('délègue à ResolveTenantUseCase.execute()', async () => {
      resolveTenantUseCase.execute.mockResolvedValue('tenant-42');

      const result = await service.resolveTenantByProviderExternalId('meta', 'ext-id-1');

      expect(resolveTenantUseCase.execute).toHaveBeenCalledWith('meta', 'ext-id-1');
      expect(result).toBe('tenant-42');
    });

    it('retourne null si aucun mapping trouvé', async () => {
      resolveTenantUseCase.execute.mockResolvedValue(null);

      const result = await service.resolveTenantByProviderExternalId('meta', 'unknown');
      expect(result).toBeNull();
    });
  });

  // ─── getDedicatedPosteId (logique reste dans ChannelService) ────────────────

  describe('getDedicatedPosteId', () => {
    it('retourne le poste_id quand le channel a un poste dédié', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ poste_id: 'poste-A' }),
      };
      channelRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getDedicatedPosteId('channel-1');
      expect(result).toBe('poste-A');
    });

    it('retourne null quand le channel est en mode pool (poste_id = null)', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ poste_id: null }),
      };
      channelRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getDedicatedPosteId('channel-2');
      expect(result).toBeNull();
    });

    it('retourne null si channelId est vide', async () => {
      const result = await service.getDedicatedPosteId('');
      expect(result).toBeNull();
      expect(channelRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
