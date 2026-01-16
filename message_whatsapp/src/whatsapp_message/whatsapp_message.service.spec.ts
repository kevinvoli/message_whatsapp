import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageService } from './whatsapp_message.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WhatsappMessage } from './entities/whatsapp_message.entity';
import { WhatsappChat } from '../whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { CommunicationWhapiService } from '../communication_whapi/communication_whapi.service';
import { WhatsappChatService } from '../whatsapp_chat/whatsapp_chat.service';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';

describe('WhatsappMessageService', () => {
  let service: WhatsappMessageService;

  const mockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockChatService = {
    findByChatId: jest.fn(),
  };

  const mockCommunicationWhapiService = {
    sendToWhapi: jest.fn(),
  };

  const mockMessageGateway = {
    handleMessageStatusUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappMessageService,
        {
          provide: getRepositoryToken(WhatsappMessage),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(WhatsappChat),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(WhatsappCommercial),
          useValue: mockRepository,
        },
        {
          provide: WhatsappChatService,
          useValue: mockChatService,
        },
        {
          provide: CommunicationWhapiService,
          useValue: mockCommunicationWhapiService,
        },
        {
          provide: WhatsappMessageGateway,
          useValue: mockMessageGateway,
        },
      ],
    }).compile();

    service = module.get<WhatsappMessageService>(WhatsappMessageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
