import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappLastMessageService } from './whatsapp_last_message.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappLastMessageService', () => {
  let service: WhatsappLastMessageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappLastMessageService],
    }).useMocker(createMocker).compile();

    service = module.get<WhatsappLastMessageService>(WhatsappLastMessageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

