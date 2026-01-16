import { Test, TestingModule } from '@nestjs/testing';
import { WhapiService } from './whapi.service';
import { DispatcherService } from '../dispatcher/dispatcher.service';
import { WhatsappMessageService } from '../whatsapp_message/whatsapp_message.service';
import { WhatsappMessageGateway } from '../whatsapp_message/whatsapp_message.gateway';

describe('WhapiService', () => {
  let service: WhapiService;

  const mockDispatcherService = {
    assignConversation: jest.fn(),
  };

  const mockWhatsappMessageService = {
    saveIncomingFromWhapi: jest.fn(),
  };

  const mockWhatsappMessageGateway = {
    emitIncomingMessage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhapiService,
        {
          provide: DispatcherService,
          useValue: mockDispatcherService,
        },
        {
          provide: WhatsappMessageService,
          useValue: mockWhatsappMessageService,
        },
        {
          provide: WhatsappMessageGateway,
          useValue: mockWhatsappMessageGateway,
        },
      ],
    }).compile();

    service = module.get<WhapiService>(WhapiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
