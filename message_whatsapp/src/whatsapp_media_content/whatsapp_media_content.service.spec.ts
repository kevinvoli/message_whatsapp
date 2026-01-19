import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMediaContentService } from './whatsapp_media_content.service';

describe('WhatsappMediaContentService', () => {
  let service: WhatsappMediaContentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMediaContentService],
    }).compile();

    service = module.get<WhatsappMediaContentService>(
      WhatsappMediaContentService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
