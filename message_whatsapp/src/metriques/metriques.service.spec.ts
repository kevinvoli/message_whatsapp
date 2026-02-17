import { Test, TestingModule } from '@nestjs/testing';
import { MetriquesService } from './metriques.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('MetriquesService', () => {
  let service: MetriquesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetriquesService],
    })
      .useMocker(createMocker)
      .compile();

    service = module.get<MetriquesService>(MetriquesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
