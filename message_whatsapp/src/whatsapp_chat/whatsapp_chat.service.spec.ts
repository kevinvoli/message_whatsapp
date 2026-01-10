import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatService } from './whatsapp_chat.service';

describe('WhatsappChatService', () => {
  let service: WhatsappChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappChatService],
    }).compile();

    service = module.get<WhatsappChatService>(WhatsappChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
