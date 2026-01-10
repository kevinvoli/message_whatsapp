import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappCustomerService } from './whatsapp_customer.service';

describe('WhatsappCustomerService', () => {
  let service: WhatsappCustomerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappCustomerService],
    }).compile();

    service = module.get<WhatsappCustomerService>(WhatsappCustomerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
