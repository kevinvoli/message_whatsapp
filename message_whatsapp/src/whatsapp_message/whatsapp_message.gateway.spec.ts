import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';
import { WhatsappMessageService } from './whatsapp_message.service';

describe('WhatsappMessageGateway', () => {
  let gateway: WhatsappMessageGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageGateway, WhatsappMessageService],
    }).compile();

    gateway = module.get<WhatsappMessageGateway>(WhatsappMessageGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
