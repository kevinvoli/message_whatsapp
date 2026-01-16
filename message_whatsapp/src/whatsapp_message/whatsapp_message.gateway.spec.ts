import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappChatService } from '../whatsapp_chat/whatsapp_chat.service';
import { WhatsappCommercialService } from '../whatsapp_commercial/whatsapp_commercial.service';
import { QueueService } from '../dispatcher/services/queue.service';
import { DispatcherService } from '../dispatcher/dispatcher.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WhatsappMessage } from './entities/whatsapp_message.entity';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';

describe('WhatsappMessageGateway', () => {
  let gateway: WhatsappMessageGateway;

  const mockRepository = {
    // mock repository methods
  };

  const mockService = {
    // mock service methods
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappMessageGateway,
        { provide: WhatsappMessageService, useValue: mockService },
        { provide: WhatsappChatService, useValue: mockService },
        { provide: WhatsappCommercialService, useValue: mockService },
        { provide: QueueService, useValue: mockService },
        { provide: DispatcherService, useValue: mockService },
        { provide: getRepositoryToken(WhatsappMessage), useValue: mockRepository },
        { provide: getRepositoryToken(WhatsappCommercial), useValue: mockRepository },
      ],
    }).compile();

    gateway = module.get<WhatsappMessageGateway>(WhatsappMessageGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
