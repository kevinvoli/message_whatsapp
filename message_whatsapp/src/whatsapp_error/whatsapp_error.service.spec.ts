import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappErrorService } from './whatsapp_error.service';

describe('WhatsappErrorService', () => {
  let service: WhatsappErrorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappErrorService],
    }).compile();

    service = module.get<WhatsappErrorService>(WhatsappErrorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
