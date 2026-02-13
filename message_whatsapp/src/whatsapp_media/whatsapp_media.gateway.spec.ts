import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMediaGateway } from './whatsapp_media.gateway';
import { WhatsappMediaService } from './whatsapp_media.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappMediaGateway', () => {
  let gateway: WhatsappMediaGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMediaGateway, WhatsappMediaService],
    }).useMocker(createMocker).compile();

    gateway = module.get<WhatsappMediaGateway>(WhatsappMediaGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});

