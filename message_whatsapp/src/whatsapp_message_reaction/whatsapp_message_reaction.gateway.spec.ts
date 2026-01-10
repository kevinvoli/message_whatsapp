import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageReactionGateway } from './whatsapp_message_reaction.gateway';
import { WhatsappMessageReactionService } from './whatsapp_message_reaction.service';

describe('WhatsappMessageReactionGateway', () => {
  let gateway: WhatsappMessageReactionGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageReactionGateway, WhatsappMessageReactionService],
    }).compile();

    gateway = module.get<WhatsappMessageReactionGateway>(WhatsappMessageReactionGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
