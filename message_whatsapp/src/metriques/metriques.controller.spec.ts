import { Test, TestingModule } from '@nestjs/testing';
import { MetriquesController } from './metriques.controller';
import { MetriquesService } from './metriques.service';

describe('MetriquesController', () => {
  let controller: MetriquesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetriquesController],
      providers: [MetriquesService],
    }).compile();

    controller = module.get<MetriquesController>(MetriquesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
