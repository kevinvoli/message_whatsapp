import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatEventGateway } from './whatsapp_chat_event.gateway';
import { WhatsappChatEventService } from './whatsapp_chat_event.service';

describe('WhatsappChatEventGateway', () => {
  let gateway: WhatsappChatEventGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappChatEventGateway, WhatsappChatEventService],
    }).compile();

    gateway = module.get<WhatsappChatEventGateway>(WhatsappChatEventGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
