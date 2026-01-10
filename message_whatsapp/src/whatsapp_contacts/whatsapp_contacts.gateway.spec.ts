import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappContactsGateway } from './whatsapp_contacts.gateway';
import { WhatsappContactsService } from './whatsapp_contacts.service';

describe('WhatsappContactsGateway', () => {
  let gateway: WhatsappContactsGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappContactsGateway, WhatsappContactsService],
    }).compile();

    gateway = module.get<WhatsappContactsGateway>(WhatsappContactsGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
