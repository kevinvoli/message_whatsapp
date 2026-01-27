import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappPosteService } from './whatsapp_poste.service';

describe('WhatsappPosteService', () => {
  let service: WhatsappPosteService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappPosteService],
    }).compile();

    service = module.get<WhatsappPosteService>(WhatsappPosteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
