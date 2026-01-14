import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappConversationGateway } from './whatsapp_conversation.gateway';
import { WhatsappConversationService } from './whatsapp_conversation.service';

describe('WhatsappConversationGateway', () => {
  let gateway: WhatsappConversationGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappConversationGateway, WhatsappConversationService],
    }).compile();

    gateway = module.get<WhatsappConversationGateway>(
      WhatsappConversationGateway,
    );
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
