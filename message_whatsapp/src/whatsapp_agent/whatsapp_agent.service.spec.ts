import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappAgentService } from './whatsapp_agent.service';

describe('WhatsappAgentService', () => {
  let service: WhatsappAgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappAgentService],
    }).compile();

    service = module.get<WhatsappAgentService>(WhatsappAgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
