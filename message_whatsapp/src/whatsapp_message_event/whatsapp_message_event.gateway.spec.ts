import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageEventGateway } from './whatsapp_message_event.gateway';
import { WhatsappMessageEventService } from './whatsapp_message_event.service';

describe('WhatsappMessageEventGateway', () => {
  let gateway: WhatsappMessageEventGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageEventGateway, WhatsappMessageEventService],
    }).compile();

    gateway = module.get<WhatsappMessageEventGateway>(WhatsappMessageEventGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
