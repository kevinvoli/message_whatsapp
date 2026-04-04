import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DispatcherService } from './dispatcher.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { QueueService } from './services/queue.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { NotificationService } from 'src/notification/notification.service';
import { ChannelService } from 'src/channel/channel.service';

describe('DispatcherService', () => {
  let service: DispatcherService;

  const chatRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
    create: jest.fn((data) => data),
  };
  const posteRepository = {
    findOne: jest.fn(),
  };
  const queueService = {
    getNextInQueue: jest.fn(),
    getQueuePositions: jest.fn(),
  };
  const gateway = {
    isAgentConnected: jest.fn(),
    emitConversationReassigned: jest.fn(),
    emitConversationUpsertByChatId: jest.fn(),
    emitConversationAssigned: jest.fn(),
  };
  const channelService = {
    getDedicatedPosteId: jest.fn(),
  };
  const notificationService = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherService,
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepository },
        { provide: getRepositoryToken(WhatsappPoste), useValue: posteRepository },
        { provide: QueueService, useValue: queueService },
        { provide: WhatsappMessageGateway, useValue: gateway },
        { provide: WhatsappCommercialService, useValue: {} },
        { provide: NotificationService, useValue: notificationService },
        { provide: ChannelService, useValue: channelService },
      ],
    }).compile();

    service = module.get<DispatcherService>(DispatcherService);
  });

  // ─── Tests existants (régression) ──────────────────────────────────────────

  it('ignores read_only conversations', async () => {
    chatRepository.findOne.mockResolvedValue({
      chat_id: '123@c.us',
      read_only: true,
      unread_count: 0,
      last_activity_at: null,
    });
    chatRepository.save.mockImplementation(async (c) => c);
    gateway.isAgentConnected.mockReturnValue(false);

    const result = await service.assignConversation('123@c.us', 'Client');
    expect(result).not.toBeNull();
    expect(queueService.getNextInQueue).not.toHaveBeenCalled();
  });

  it('sets status and mode based on next agent activity', async () => {
    const conversation = {
      chat_id: '123@c.us',
      read_only: false,
      unread_count: 0,
      last_activity_at: null,
      poste: null,
      status: WhatsappChatStatus.EN_ATTENTE,
      assigned_mode: null,
    };

    chatRepository.findOne.mockResolvedValue(conversation);
    gateway.isAgentConnected.mockReturnValue(false);
    channelService.getDedicatedPosteId.mockResolvedValue(null);
    queueService.getNextInQueue.mockResolvedValue({
      id: 'poste-1',
      name: 'Poste 1',
      is_active: false,
    });
    chatRepository.save.mockImplementation(async (chat) => chat);

    const result = await service.assignConversation('123@c.us', 'Client');
    expect(result?.status).toBe(WhatsappChatStatus.EN_ATTENTE);
    expect(result?.assigned_mode).toBe('OFFLINE');
  });

  // ─── Tests channel dédié (CH-01 à CH-05) ───────────────────────────────────

  describe('assignConversation avec channel dédié', () => {
    it('CH-01 : canal dédié actif → assignation directe au poste dédié, queue non utilisée', async () => {
      chatRepository.findOne.mockResolvedValue(null); // pas de conversation existante
      channelService.getDedicatedPosteId.mockResolvedValue('poste-A');
      posteRepository.findOne.mockResolvedValue({
        id: 'poste-A',
        name: 'Poste A',
        is_active: true,
      });
      chatRepository.save.mockImplementation(async (c) => c);
      gateway.emitConversationUpsertByChatId.mockResolvedValue(undefined);

      const result = await service.assignConversation(
        'client@c.us',
        'Ahmed',
        'trace-1',
        'tenant-1',
        'channel-1',
      );

      expect(result?.poste_id).toBe('poste-A');
      expect(result?.status).toBe(WhatsappChatStatus.ACTIF);
      expect(queueService.getNextInQueue).not.toHaveBeenCalled();
    });

    it('CH-02 : canal dédié offline → EN_ATTENTE sur le poste dédié, queue non utilisée', async () => {
      chatRepository.findOne.mockResolvedValue(null);
      channelService.getDedicatedPosteId.mockResolvedValue('poste-A');
      posteRepository.findOne.mockResolvedValue({
        id: 'poste-A',
        name: 'Poste A',
        is_active: false,
      });
      chatRepository.save.mockImplementation(async (c) => c);
      gateway.emitConversationUpsertByChatId.mockResolvedValue(undefined);

      const result = await service.assignConversation(
        'client@c.us',
        'Ahmed',
        'trace-2',
        'tenant-1',
        'channel-1',
      );

      expect(result?.poste_id).toBe('poste-A');
      expect(result?.status).toBe(WhatsappChatStatus.EN_ATTENTE);
      expect(queueService.getNextInQueue).not.toHaveBeenCalled();
    });

    it('CH-03 : canal sans poste dédié → comportement pool (queue globale)', async () => {
      chatRepository.findOne.mockResolvedValue(null);
      channelService.getDedicatedPosteId.mockResolvedValue(null);
      queueService.getNextInQueue.mockResolvedValue({
        id: 'poste-B',
        name: 'Poste B',
        is_active: true,
      });
      chatRepository.save.mockImplementation(async (c) => c);
      gateway.emitConversationUpsertByChatId.mockResolvedValue(undefined);

      await service.assignConversation(
        'client2@c.us',
        'Mohamed',
        'trace-3',
        'tenant-1',
        'channel-2',
      );

      expect(queueService.getNextInQueue).toHaveBeenCalledTimes(1);
    });

    it('CH-04 : canal dédié mais poste introuvable en DB → fallback queue globale', async () => {
      chatRepository.findOne.mockResolvedValue(null);
      channelService.getDedicatedPosteId.mockResolvedValue('poste-inconnu');
      posteRepository.findOne.mockResolvedValue(null); // poste supprimé
      queueService.getNextInQueue.mockResolvedValue({
        id: 'poste-C',
        name: 'Poste C',
        is_active: true,
      });
      chatRepository.save.mockImplementation(async (c) => c);
      gateway.emitConversationUpsertByChatId.mockResolvedValue(undefined);

      await service.assignConversation(
        'client3@c.us',
        'Sara',
        'trace-4',
        'tenant-1',
        'channel-3',
      );

      expect(queueService.getNextInQueue).toHaveBeenCalledTimes(1);
    });

    it('CH-05 : conversation existante avec agent actif → incrément seulement, pas de réassignation', async () => {
      const existingChat = {
        chat_id: 'client@c.us',
        read_only: false,
        unread_count: 2,
        last_activity_at: new Date(),
        first_response_deadline_at: new Date(),
        last_poste_message_at: null,
        poste: { id: 'poste-A', name: 'Poste A' },
        poste_id: 'poste-A',
        status: WhatsappChatStatus.ACTIF,
      };
      chatRepository.findOne.mockResolvedValue(existingChat);
      gateway.isAgentConnected.mockReturnValue(true); // agent connecté
      chatRepository.save.mockImplementation(async (c) => c);
      gateway.emitConversationUpsertByChatId.mockResolvedValue(undefined);

      await service.assignConversation(
        'client@c.us',
        'Ahmed',
        'trace-5',
        'tenant-1',
        'channel-1',
      );

      // Queue non touchée — agent actif sur ce poste
      expect(queueService.getNextInQueue).not.toHaveBeenCalled();
      // ChannelService non consulté — court-circuit avant resolvePosteForChannel
      expect(channelService.getDedicatedPosteId).not.toHaveBeenCalled();
    });
  });
});
