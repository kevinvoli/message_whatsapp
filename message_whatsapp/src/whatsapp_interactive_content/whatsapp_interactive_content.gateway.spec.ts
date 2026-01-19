import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappInteractiveContentGateway } from './whatsapp_interactive_content.gateway';
import { WhatsappInteractiveContentService } from './whatsapp_interactive_content.service';

describe('WhatsappInteractiveContentGateway', () => {
  let gateway: WhatsappInteractiveContentGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappInteractiveContentGateway,
        WhatsappInteractiveContentService,
      ],
    }).compile();

    gateway = module.get<WhatsappInteractiveContentGateway>(
      WhatsappInteractiveContentGateway,
    );
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
