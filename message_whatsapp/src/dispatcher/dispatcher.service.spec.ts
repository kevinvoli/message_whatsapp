import { Test, TestingModule } from '@nestjs/testing';
import { DispatcherService } from './dispatcher.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('DispatcherService', () => {
  let service: DispatcherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DispatcherService],
    }).useMocker(createMocker).compile();

    service = module.get<DispatcherService>(DispatcherService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

