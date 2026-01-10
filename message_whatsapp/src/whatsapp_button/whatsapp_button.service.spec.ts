import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappButtonService } from './whatsapp_button.service';

describe('WhatsappButtonService', () => {
  let service: WhatsappButtonService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappButtonService],
    }).compile();

    service = module.get<WhatsappButtonService>(WhatsappButtonService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
