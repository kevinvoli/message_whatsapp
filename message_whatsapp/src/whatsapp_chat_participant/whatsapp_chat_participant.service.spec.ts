import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatParticipantService } from './whatsapp_chat_participant.service';

describe('WhatsappChatParticipantService', () => {
  let service: WhatsappChatParticipantService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappChatParticipantService],
    }).compile();

    service = module.get<WhatsappChatParticipantService>(WhatsappChatParticipantService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
