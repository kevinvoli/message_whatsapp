import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageEventService } from './whatsapp_message_event.service';

describe('WhatsappMessageEventService', () => {
  let service: WhatsappMessageEventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageEventService],
    }).compile();

    service = module.get<WhatsappMessageEventService>(WhatsappMessageEventService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
