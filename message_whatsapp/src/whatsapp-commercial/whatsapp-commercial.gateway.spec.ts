import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappCommercialGateway } from './whatsapp-commercial.gateway';
import { WhatsappCommercialService } from './whatsapp-commercial.service';

describe('WhatsappCommercialGateway', () => {
  let gateway: WhatsappCommercialGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappCommercialGateway, WhatsappCommercialService],
    }).compile();

    gateway = module.get<WhatsappCommercialGateway>(WhatsappCommercialGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
