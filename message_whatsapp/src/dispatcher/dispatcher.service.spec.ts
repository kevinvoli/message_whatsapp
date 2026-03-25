import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DispatcherService } from './dispatcher.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { QueueService } from './services/queue.service';
import { AgentStateService } from 'src/agent-state/agent-state.service';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { NotificationService } from 'src/notification/notification.service';

describe('DispatcherService', () => {
  let service: DispatcherService;
  const chatRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
  };
  const queueService = {
    getNextInQueue: jest.fn(),
    getQueuePositions: jest.fn(),
  };
  const agentStateService = {
    isConnected: jest.fn(),
    register: jest.fn(),
    unregister: jest.fn(),
  };
  const eventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherService,
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepository },
        { provide: QueueService, useValue: queueService },
        { provide: AgentStateService, useValue: agentStateService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: WhatsappCommercialService, useValue: {} },
        { provide: NotificationService, useValue: { create: jest.fn() } },
      ],
    }).compile();

    service = module.get<DispatcherService>(DispatcherService);
  });

  it('ignores read_only conversations', async () => {
    chatRepository.findOne.mockResolvedValue({
      chat_id: '123@c.us',
      read_only: true,
      unread_count: 0,
    });
    chatRepository.save.mockImplementation(async (chat) => chat);
    agentStateService.isConnected.mockReturnValue(false);

    const result = await service.assignConversation('123@c.us', 'Client');
    // read_only conversations are returned as-is (not null) after incrementing unread_count
    expect(result).not.toBeNull();
    expect(result?.read_only).toBe(true);
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
    agentStateService.isConnected.mockReturnValue(false);
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
});
