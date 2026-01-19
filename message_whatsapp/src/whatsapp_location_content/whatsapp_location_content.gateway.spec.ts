import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappLocationContentGateway } from './whatsapp_location_content.gateway';
import { WhatsappLocationContentService } from './whatsapp_location_content.service';

describe('WhatsappLocationContentGateway', () => {
  let gateway: WhatsappLocationContentGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappLocationContentGateway,
        WhatsappLocationContentService,
      ],
    }).compile();

    gateway = module.get<WhatsappLocationContentGateway>(
      WhatsappLocationContentGateway,
    );
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
