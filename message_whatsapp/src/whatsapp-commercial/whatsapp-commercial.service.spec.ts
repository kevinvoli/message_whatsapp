import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappCommercialService } from './whatsapp-commercial.service';

describe('WhatsappCommercialService', () => {
  let service: WhatsappCommercialService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappCommercialService],
    }).compile();

    service = module.get<WhatsappCommercialService>(WhatsappCommercialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
