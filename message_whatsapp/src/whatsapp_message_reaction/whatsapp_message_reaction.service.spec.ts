import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageReactionService } from './whatsapp_message_reaction.service';

describe('WhatsappMessageReactionService', () => {
  let service: WhatsappMessageReactionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageReactionService],
    }).compile();

    service = module.get<WhatsappMessageReactionService>(
      WhatsappMessageReactionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
