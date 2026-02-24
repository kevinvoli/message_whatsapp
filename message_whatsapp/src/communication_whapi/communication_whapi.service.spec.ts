import { Test, TestingModule } from '@nestjs/testing';
import { CommunicationWhapiService } from './communication_whapi.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('CommunicationWhapiService', () => {
  let service: CommunicationWhapiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommunicationWhapiService],
    })
      .useMocker(createMocker)
      .compile();

    service = module.get<CommunicationWhapiService>(CommunicationWhapiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
