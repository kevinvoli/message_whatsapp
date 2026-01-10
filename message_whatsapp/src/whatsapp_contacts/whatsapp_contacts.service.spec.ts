import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappContactsService } from './whatsapp_contacts.service';

describe('WhatsappContactsService', () => {
  let service: WhatsappContactsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappContactsService],
    }).compile();

    service = module.get<WhatsappContactsService>(WhatsappContactsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
