import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMediaGateway } from './whatsapp_media.gateway';
import { WhatsappMediaService } from './whatsapp_media.service';

describe('WhatsappMediaGateway', () => {
  let gateway: WhatsappMediaGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMediaGateway, WhatsappMediaService],
    }).compile();

    gateway = module.get<WhatsappMediaGateway>(WhatsappMediaGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
