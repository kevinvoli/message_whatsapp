import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappStatusesService } from './whatsapp_statuses.service';

describe('WhatsappStatusesService', () => {
  let service: WhatsappStatusesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappStatusesService],
    }).compile();

    service = module.get<WhatsappStatusesService>(WhatsappStatusesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
