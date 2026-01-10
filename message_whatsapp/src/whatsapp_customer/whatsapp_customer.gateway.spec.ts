import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappCustomerGateway } from './whatsapp_customer.gateway';
import { WhatsappCustomerService } from './whatsapp_customer.service';

describe('WhatsappCustomerGateway', () => {
  let gateway: WhatsappCustomerGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappCustomerGateway, WhatsappCustomerService],
    }).compile();

    gateway = module.get<WhatsappCustomerGateway>(WhatsappCustomerGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
