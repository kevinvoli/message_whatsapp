import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatGateway } from './whatsapp_chat.gateway';
import { WhatsappChatService } from './whatsapp_chat.service';

describe('WhatsappChatGateway', () => {
  let gateway: WhatsappChatGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappChatGateway, WhatsappChatService],
    }).compile();

    gateway = module.get<WhatsappChatGateway>(WhatsappChatGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
