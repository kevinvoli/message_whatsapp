import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageService } from './whatsapp_message.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappMessageService', () => {
  let service: WhatsappMessageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageService],
    }).useMocker(createMocker).compile();

    service = module.get<WhatsappMessageService>(WhatsappMessageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

