import { Test, TestingModule } from '@nestjs/testing';
import { WhapiController } from './whapi.controller';
import { WhapiService } from './whapi.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('WhapiController', () => {
  let controller: WhapiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhapiController],
      providers: [WhapiService],
    })
      .useMocker(createMocker)
      .compile();

    controller = module.get<WhapiController>(WhapiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
