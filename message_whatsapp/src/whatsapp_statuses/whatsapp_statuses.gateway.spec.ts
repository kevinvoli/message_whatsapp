import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappStatusesGateway } from './whatsapp_statuses.gateway';
import { WhatsappStatusesService } from './whatsapp_statuses.service';

describe('WhatsappStatusesGateway', () => {
  let gateway: WhatsappStatusesGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappStatusesGateway, WhatsappStatusesService],
    }).compile();

    gateway = module.get<WhatsappStatusesGateway>(WhatsappStatusesGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
