import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMediaService } from './whatsapp_media.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhatsappMediaService', () => {
  let service: WhatsappMediaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMediaService],
    }).useMocker(createMocker).compile();

    service = module.get<WhatsappMediaService>(WhatsappMediaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

