import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatEventService } from './whatsapp_chat_event.service';

describe('WhatsappChatEventService', () => {
  let service: WhatsappChatEventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappChatEventService],
    }).compile();

    service = module.get<WhatsappChatEventService>(WhatsappChatEventService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
