import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappInteractiveContentService } from './whatsapp_interactive_content.service';

describe('WhatsappInteractiveContentService', () => {
  let service: WhatsappInteractiveContentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappInteractiveContentService],
    }).compile();

    service = module.get<WhatsappInteractiveContentService>(
      WhatsappInteractiveContentService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
