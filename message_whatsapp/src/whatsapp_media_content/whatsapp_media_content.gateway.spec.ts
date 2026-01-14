import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMediaContentGateway } from './whatsapp_media_content.gateway';
import { WhatsappMediaContentService } from './whatsapp_media_content.service';

describe('WhatsappMediaContentGateway', () => {
  let gateway: WhatsappMediaContentGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMediaContentGateway, WhatsappMediaContentService],
    }).compile();

    gateway = module.get<WhatsappMediaContentGateway>(
      WhatsappMediaContentGateway,
    );
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
