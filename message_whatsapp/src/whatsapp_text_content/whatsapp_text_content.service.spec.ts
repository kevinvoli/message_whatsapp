import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappTextContentService } from './whatsapp_text_content.service';

describe('WhatsappTextContentService', () => {
  let service: WhatsappTextContentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappTextContentService],
    }).compile();

    service = module.get<WhatsappTextContentService>(
      WhatsappTextContentService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
