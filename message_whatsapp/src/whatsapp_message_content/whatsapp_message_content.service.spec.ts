import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageContentService } from './whatsapp_message_content.service';

describe('WhatsappMessageContentService', () => {
  let service: WhatsappMessageContentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageContentService],
    }).compile();

    service = module.get<WhatsappMessageContentService>(WhatsappMessageContentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
