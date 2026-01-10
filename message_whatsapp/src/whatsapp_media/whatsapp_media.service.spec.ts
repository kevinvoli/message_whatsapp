import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMediaService } from './whatsapp_media.service';

describe('WhatsappMediaService', () => {
  let service: WhatsappMediaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMediaService],
    }).compile();

    service = module.get<WhatsappMediaService>(WhatsappMediaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
