import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessageContentGateway } from './whatsapp_message_content.gateway';
import { WhatsappMessageContentService } from './whatsapp_message_content.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappMessageContentGateway', () => {
  let gateway: WhatsappMessageContentGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessageContentGateway, WhatsappMessageContentService],
    }).useMocker(createMocker).compile();

    gateway = module.get<WhatsappMessageContentGateway>(WhatsappMessageContentGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});

