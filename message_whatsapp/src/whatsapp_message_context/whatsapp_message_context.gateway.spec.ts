import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageContextGateway } from './whatsapp_message_context.gateway';
import { WhatsappMessageContextService } from './whatsapp_message_context.service';

describe('WhatsappMessageContextGateway', () => {
  let gateway: WhatsappMessageContextGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageContextGateway, WhatsappMessageContextService],
    }).compile();

    gateway = module.get<WhatsappMessageContextGateway>(WhatsappMessageContextGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
