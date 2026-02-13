import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageContentService } from './whatsapp_message_content.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappMessageContentService', () => {
  let service: WhatsappMessageContentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageContentService],
    }).useMocker(createMocker).compile();

    service = module.get<WhatsappMessageContentService>(WhatsappMessageContentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

