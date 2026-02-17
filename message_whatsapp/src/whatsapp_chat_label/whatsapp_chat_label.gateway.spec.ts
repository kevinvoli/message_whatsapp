import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatLabelGateway } from './whatsapp_chat_label.gateway';
import { WhatsappChatLabelService } from './whatsapp_chat_label.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappChatLabelGateway', () => {
  let gateway: WhatsappChatLabelGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappChatLabelGateway, WhatsappChatLabelService],
    })
      .useMocker(createMocker)
      .compile();

    gateway = module.get<WhatsappChatLabelGateway>(WhatsappChatLabelGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
