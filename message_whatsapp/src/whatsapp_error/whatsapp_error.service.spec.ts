import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappErrorService } from './whatsapp_error.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappErrorService', () => {
  let service: WhatsappErrorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappErrorService],
    }).useMocker(createMocker).compile();

    service = module.get<WhatsappErrorService>(WhatsappErrorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

