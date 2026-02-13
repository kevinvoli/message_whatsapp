import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappPosteService } from './whatsapp_poste.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappPosteService', () => {
  let service: WhatsappPosteService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappPosteService],
    }).useMocker(createMocker).compile();

    service = module.get<WhatsappPosteService>(WhatsappPosteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

