import { Test, TestingModule } from '@nestjs/testing';
import { DispatcherOrchestrator } from './dispatcher-orchestrator.service';
import { AssignmentService } from './assignment.service';
import { QueueService } from './queue.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Repository } from 'typeorm';

describe('DispatcherOrchestrator', () => {
  let service: DispatcherOrchestrator;
  let assignmentService: AssignmentService;
  let queueService: QueueService;
  let messageService: WhatsappMessageService;
  let messageGateway: WhatsappMessageGateway;
  let chatRepository: Repository<WhatsappChat>;
  let commercialRepository: Repository<WhatsappCommercial>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherOrchestrator,
        {
          provide: AssignmentService,
          useValue: {
            findNextOnlineAgent: jest.fn(),
            findNextOfflineAgent: jest.fn(),
          },
        },
        {
          provide: QueueService,
          useValue: {
            getQueuePositions: jest.fn(),
            moveToEnd: jest.fn(),
            addToQueue: jest.fn(),
            removeFromQueue: jest.fn(),
          },
        },
        {
          provide: WhatsappMessageService,
          useValue: {
            saveIncomingFromWhapi: jest.fn(),
          },
        },
        {
          provide: WhatsappMessageGateway,
          useValue: {
            emitConversationReassigned: jest.fn(),
            emitNewConversationToAgent: jest.fn(),
            emitMessageToAgent: jest.fn(),
            emitAgentStatusUpdate: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WhatsappChat),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WhatsappCommercial),
          useValue: {
            update: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DispatcherOrchestrator>(DispatcherOrchestrator);
    assignmentService = module.get<AssignmentService>(AssignmentService);
    queueService = module.get<QueueService>(QueueService);
    messageService = module.get<WhatsappMessageService>(WhatsappMessageService);
    messageGateway = module.get<WhatsappMessageGateway>(WhatsappMessageGateway);
    chatRepository = module.get<Repository<WhatsappChat>>(getRepositoryToken(WhatsappChat));
    commercialRepository = module.get<Repository<WhatsappCommercial>>(getRepositoryToken(WhatsappCommercial));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleIncomingMessage', () => {
    it('should assign a new conversation to an online agent', async () => {
      // Mock data
      const payload = {
        messages: [{ chat_id: '123', from_name: 'Test', id: 'msg1' }],
      } as any;
      const chat = { id: 'chat1', commercial_id: null } as any;
      const agent = { id: 'agent1' } as any;

      // Mock service methods
      jest.spyOn(chatRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(chatRepository, 'create').mockReturnValue(chat);
      jest.spyOn(chatRepository, 'save').mockResolvedValue(chat);
      jest.spyOn(queueService, 'getQueuePositions').mockResolvedValue([{ user: agent }] as any);
      jest.spyOn(assignmentService, 'findNextOnlineAgent').mockReturnValue(agent);
      jest.spyOn(messageService, 'saveIncomingFromWhapi').mockResolvedValue({} as any);

      // Call the method
      await service.handleIncomingMessage(payload);

      // Assertions
      expect(chatRepository.findOne).toHaveBeenCalledWith({ where: { chat_id: '123' }, relations: ['commercial'] });
      expect(queueService.getQueuePositions).toHaveBeenCalled();
      expect(assignmentService.findNextOnlineAgent).toHaveBeenCalled();
      expect(chatRepository.save).toHaveBeenCalledWith(expect.objectContaining({ commercial_id: 'agent1' }));
      expect(messageGateway.emitNewConversationToAgent).toHaveBeenCalledWith('agent1', expect.any(Object));
      expect(messageGateway.emitMessageToAgent).toHaveBeenCalledWith('agent1', expect.any(Object));
    });
  });

  describe('handleUserConnected', () => {
    it('should add the user to the queue and update their status', async () => {
      const commercialId = 'agent1';
      await service.handleUserConnected(commercialId);

      expect(commercialRepository.update).toHaveBeenCalledWith(commercialId, { isConnected: true, lastConnectionAt: expect.any(Date) });
      expect(queueService.addToQueue).toHaveBeenCalledWith(commercialId);
      expect(messageGateway.emitAgentStatusUpdate).toHaveBeenCalledWith(commercialId, true);
    });
  });

  describe('handleUserDisconnected', () => {
    it('should remove the user from the queue and update their status', async () => {
      const commercialId = 'agent1';
      jest.spyOn(chatRepository, 'find').mockResolvedValue([]);
      await service.handleUserDisconnected(commercialId);

      expect(commercialRepository.update).toHaveBeenCalledWith(commercialId, { isConnected: false });
      expect(queueService.removeFromQueue).toHaveBeenCalledWith(commercialId);
      expect(messageGateway.emitAgentStatusUpdate).toHaveBeenCalledWith(commercialId, false);
    });
  });
});
