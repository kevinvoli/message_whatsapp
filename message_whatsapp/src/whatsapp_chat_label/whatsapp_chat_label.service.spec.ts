import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatLabelService } from './whatsapp_chat_label.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappChatLabelService', () => {
  let service: WhatsappChatLabelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappChatLabelService],
    }).useMocker(createMocker).compile();

    service = module.get<WhatsappChatLabelService>(WhatsappChatLabelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

