import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageContextService } from './whatsapp_message_context.service';

describe('WhatsappMessageContextService', () => {
  let service: WhatsappMessageContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageContextService],
    }).compile();

    service = module.get<WhatsappMessageContextService>(
      WhatsappMessageContextService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
