import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { WhapiChannel } from './entities/channel.entity';
import { ProviderChannel } from './entities/provider-channel.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { MetaTokenService } from './meta-token.service';
import { CommunicationTelegramService } from 'src/communication_whapi/communication_telegram.service';
import { AppLogger } from 'src/logging/app-logger.service';

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
  };
  const posteRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelService,
        { provide: getRepositoryToken(WhapiChannel), useValue: channelRepository },
        { provide: getRepositoryToken(ProviderChannel), useValue: providerChannelRepository },
        { provide: getRepositoryToken(WhatsappPoste), useValue: posteRepository },
        { provide: CommunicationWhapiService, useValue: {} },
        { provide: MetaTokenService, useValue: {} },
        { provide: CommunicationTelegramService, useValue: {} },
        { provide: AppLogger, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── Tests assignPoste (AS-01 à AS-03) ─────────────────────────────────────

  describe('assignPoste', () => {
    it('AS-01 : assignation valide → update appelé avec poste_id', async () => {
      posteRepository.findOne.mockResolvedValue({ id: 'poste-A', name: 'Poste A' });
      channelRepository.update.mockResolvedValue({ affected: 1 });
      channelRepository.findOne.mockResolvedValue({
        id: 'ch-uuid',
        channel_id: 'channel-1',
        poste_id: 'poste-A',
        poste: { id: 'poste-A', name: 'Poste A' },
      });

      const result = await service.assignPoste('channel-1', 'poste-A');

      expect(channelRepository.update).toHaveBeenCalledWith(
        { channel_id: 'channel-1' },
        { poste_id: 'poste-A' },
      );
      expect(result.poste_id).toBe('poste-A');
    });

    it('AS-02 : désassignation (null) → poste_id = null dans update', async () => {
      channelRepository.update.mockResolvedValue({ affected: 1 });
      channelRepository.findOne.mockResolvedValue({
        id: 'ch-uuid',
        channel_id: 'channel-1',
        poste_id: null,
        poste: null,
      });

      await service.assignPoste('channel-1', null);

      expect(posteRepository.findOne).not.toHaveBeenCalled();
      expect(channelRepository.update).toHaveBeenCalledWith(
        { channel_id: 'channel-1' },
        { poste_id: null },
      );
    });

    it('AS-03 : poste inexistant → NotFoundException', async () => {
      posteRepository.findOne.mockResolvedValue(null);

      await expect(service.assignPoste('channel-1', 'poste-inconnu'))
        .rejects.toThrow(NotFoundException);

      expect(channelRepository.update).not.toHaveBeenCalled();
    });
  });

  // ─── Tests getDedicatedPosteId ──────────────────────────────────────────────

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
