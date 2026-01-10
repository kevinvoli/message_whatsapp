import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappAgentGateway } from './whatsapp_agent.gateway';
import { WhatsappAgentService } from './whatsapp_agent.service';

describe('WhatsappAgentGateway', () => {
  let gateway: WhatsappAgentGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappAgentGateway, WhatsappAgentService],
    }).compile();

    gateway = module.get<WhatsappAgentGateway>(WhatsappAgentGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
