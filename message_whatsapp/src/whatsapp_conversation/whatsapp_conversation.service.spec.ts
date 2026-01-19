import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappConversationService } from './whatsapp_conversation.service';

describe('WhatsappConversationService', () => {
  let service: WhatsappConversationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappConversationService],
    }).compile();

    service = module.get<WhatsappConversationService>(
      WhatsappConversationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
