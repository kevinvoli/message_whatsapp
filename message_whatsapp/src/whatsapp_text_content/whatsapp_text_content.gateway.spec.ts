import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappTextContentGateway } from './whatsapp_text_content.gateway';
import { WhatsappTextContentService } from './whatsapp_text_content.service';

describe('WhatsappTextContentGateway', () => {
  let gateway: WhatsappTextContentGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappTextContentGateway, WhatsappTextContentService],
    }).compile();

    gateway = module.get<WhatsappTextContentGateway>(
      WhatsappTextContentGateway,
    );
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
