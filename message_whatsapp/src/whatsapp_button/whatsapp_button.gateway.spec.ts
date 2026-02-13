import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappButtonGateway } from './whatsapp_button.gateway';
import { WhatsappButtonService } from './whatsapp_button.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappButtonGateway', () => {
  let gateway: WhatsappButtonGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappButtonGateway, WhatsappButtonService],
    }).useMocker(createMocker).compile();

    gateway = module.get<WhatsappButtonGateway>(WhatsappButtonGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});

