import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatGateway } from './whatsapp_chat.gateway';
import { WhatsappChatService } from './whatsapp_chat.service';

describe('WhatsappChatGateway', () => {
  let gateway: WhatsappChatGateway;

  const mockChatService = {
    // mock methods here
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappChatGateway,
        {
          provide: WhatsappChatService,
          useValue: mockChatService,
        },
      ],
    }).compile();

    gateway = module.get<WhatsappChatGateway>(WhatsappChatGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
