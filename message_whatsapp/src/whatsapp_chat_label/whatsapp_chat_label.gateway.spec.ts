import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatLabelGateway } from './whatsapp_chat_label.gateway';
import { WhatsappChatLabelService } from './whatsapp_chat_label.service';

describe('WhatsappChatLabelGateway', () => {
  let gateway: WhatsappChatLabelGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappChatLabelGateway, WhatsappChatLabelService],
    }).compile();

    gateway = module.get<WhatsappChatLabelGateway>(WhatsappChatLabelGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
