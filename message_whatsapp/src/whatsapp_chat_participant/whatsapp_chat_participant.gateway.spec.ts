import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappChatParticipantGateway } from './whatsapp_chat_participant.gateway';
import { WhatsappChatParticipantService } from './whatsapp_chat_participant.service';

describe('WhatsappChatParticipantGateway', () => {
  let gateway: WhatsappChatParticipantGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappChatParticipantGateway,
        WhatsappChatParticipantService,
      ],
    }).compile();

    gateway = module.get<WhatsappChatParticipantGateway>(
      WhatsappChatParticipantGateway,
    );
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
