import { Test, TestingModule } from '@nestjs/testing';
import { DispatcherService } from './dispatcher.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PendingMessage } from './entities/pending-message.entity';
import { WhatsappChat } from '../whatsapp_chat/entities/whatsapp_chat.entity';
import { QueueService } from './services/queue.service';
import { WhatsappMessageGateway } from '../whatsapp_message/whatsapp_message.gateway';
import { WhatsappChatStatus } from '../whatsapp_chat/dto/create-whatsapp_chat.dto';

describe('DispatcherService', () => {
  let service: DispatcherService;
  let mockChatRepository;
  let mockPendingMessageRepository;
  let mockQueueService;
  let mockMessageGateway;

  beforeEach(async () => {
    mockChatRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    mockPendingMessageRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    mockQueueService = {
      getNextInQueue: jest.fn(),
    };
    mockMessageGateway = {
      isAgentConnected: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherService,
        {
          provide: getRepositoryToken(WhatsappChat),
          useValue: mockChatRepository,
        },
        {
          provide: getRepositoryToken(PendingMessage),
          useValue: mockPendingMessageRepository,
        },
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
        {
          provide: WhatsappMessageGateway,
          useValue: mockMessageGateway,
        },
      ],
    }).compile();

    service = module.get<DispatcherService>(DispatcherService);
  });

  it('should increment unread count for existing conversation with connected agent', async () => {
    const chat = { id: '1', unread_count: 1, status: 'actif', commercial: { id: '1' } };
    mockChatRepository.findOne.mockResolvedValue(chat);
    mockMessageGateway.isAgentConnected.mockReturnValue(true);
    mockChatRepository.save.mockResolvedValue({ ...chat, unread_count: 2 });

    const result = await service.assignConversation('123', 'test', 'hello', 'text');

    expect(result).not.toBeNull();
    if (result) {
      expect(result.unread_count).toBe(2);
      expect(mockChatRepository.save).toHaveBeenCalledWith(expect.objectContaining({ unread_count: 2 }));
    }
  });

  it('should reopen a closed conversation', async () => {
    const chat = { id: '1', unread_count: 0, status: 'fermé', commercial: { id: '1' } };
    mockChatRepository.findOne.mockResolvedValue(chat);
    mockMessageGateway.isAgentConnected.mockReturnValue(true);
    mockChatRepository.save.mockResolvedValue({ ...chat, status: 'actif' });

    const result = await service.assignConversation('123', 'test', 'hello', 'text');

    expect(result).not.toBeNull();
    if (result) {
      expect(result.status).toBe('actif');
      expect(mockChatRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'actif' }));
    }
  });

  it('should create a new conversation if none exists', async () => {
    mockChatRepository.findOne.mockResolvedValue(null);
    mockQueueService.getNextInQueue.mockResolvedValue({ id: 'agent1' });
    const newChat = { chat_id: '123', name: 'test', commercial_id: 'agent1' };
    mockChatRepository.create.mockReturnValue(newChat);
    mockChatRepository.save.mockResolvedValue(newChat);

    const result = await service.assignConversation('123', 'test', 'hello', 'text');

    expect(result).toEqual(newChat);
    expect(mockChatRepository.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'test' }));
  });

  it('should reassign conversation if agent is disconnected', async () => {
    const chat = { id: '1', commercial: { id: '1' } };
    mockChatRepository.findOne.mockResolvedValue(chat);
    mockMessageGateway.isAgentConnected.mockReturnValue(false);
    mockQueueService.getNextInQueue.mockResolvedValue({ id: 'agent2' });
    mockChatRepository.save.mockResolvedValue({ ...chat, commercial_id: 'agent2' });

    const result = await service.assignConversation('123', 'test', 'hello', 'text');

    expect(result).not.toBeNull();
    if (result) {
      expect(result.commercial_id).toBe('agent2');
    }
  });

  it('should add to pending messages if no agent is available', async () => {
    mockChatRepository.findOne.mockResolvedValue(null);
    mockQueueService.getNextInQueue.mockResolvedValue(null);
    const pendingMessage = { clientPhone: '123', content: 'hello' };
    mockPendingMessageRepository.create.mockReturnValue(pendingMessage);
    mockPendingMessageRepository.save.mockResolvedValue(pendingMessage);

    const result = await service.assignConversation('123', 'test', 'hello', 'text');

    expect(result).toBeNull();
    expect(mockPendingMessageRepository.save).toHaveBeenCalledWith(pendingMessage);
  });
});
