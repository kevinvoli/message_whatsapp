import { Test, TestingModule } from '@nestjs/testing';
import { MetriquesService } from './metriques.service';

describe('MetriquesService', () => {
  let service: MetriquesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetriquesService],
    }).compile();

    service = module.get<MetriquesService>(MetriquesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
