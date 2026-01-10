import { Test, TestingModule } from '@nestjs/testing';
import { WhapiController } from './whapi.controller';
import { WhapiService } from './whapi.service';

describe('WhapiController', () => {
  let controller: WhapiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhapiController],
      providers: [WhapiService],
    }).compile();

    controller = module.get<WhapiController>(WhapiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
