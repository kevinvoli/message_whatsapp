import { Test, TestingModule } from '@nestjs/testing';
import { MetriquesController } from './metriques.controller';
import { MetriquesService } from './metriques.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('MetriquesController', () => {
  let controller: MetriquesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetriquesController],
      providers: [MetriquesService],
    }).useMocker(createMocker).compile();

    controller = module.get<MetriquesController>(MetriquesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

