import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatService } from './whatsapp_chat.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
import { WhatsappCommercialService } from '../whatsapp_commercial/whatsapp_commercial.service';

describe('WhatsappChatService', () => {
  let service: WhatsappChatService;

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockCommercialService = {
    findOneById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappChatService,
        {
          provide: getRepositoryToken(WhatsappChat),
          useValue: mockRepository,
        },
        {
          provide: WhatsappCommercialService,
          useValue: mockCommercialService,
        },
      ],
    }).compile();

    service = module.get<WhatsappChatService>(WhatsappChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
