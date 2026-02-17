import { Test, TestingModule } from '@nestjs/testing';
import { WhapiService } from './whapi.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhapiService', () => {
  let service: WhapiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhapiService],
    })
      .useMocker(createMocker)
      .compile();

    service = module.get<WhapiService>(WhapiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
