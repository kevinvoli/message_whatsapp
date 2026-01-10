import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappLocationContentService } from './whatsapp_location_content.service';

describe('WhatsappLocationContentService', () => {
  let service: WhatsappLocationContentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappLocationContentService],
    }).compile();

    service = module.get<WhatsappLocationContentService>(WhatsappLocationContentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
