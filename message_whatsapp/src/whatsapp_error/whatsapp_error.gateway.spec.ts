import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappErrorGateway } from './whatsapp_error.gateway';
import { WhatsappErrorService } from './whatsapp_error.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappErrorGateway', () => {
  let gateway: WhatsappErrorGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappErrorGateway, WhatsappErrorService],
    }).useMocker(createMocker).compile();

    gateway = module.get<WhatsappErrorGateway>(WhatsappErrorGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});

