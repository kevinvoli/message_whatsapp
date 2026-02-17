import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappLastMessageGateway } from './whatsapp_last_message.gateway';
import { WhatsappLastMessageService } from './whatsapp_last_message.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappLastMessageGateway', () => {
  let gateway: WhatsappLastMessageGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappLastMessageGateway, WhatsappLastMessageService],
    })
      .useMocker(createMocker)
      .compile();

    gateway = module.get<WhatsappLastMessageGateway>(
      WhatsappLastMessageGateway,
    );
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
