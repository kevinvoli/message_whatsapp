import { Test, TestingModule } from '@nestjs/testing';
import { DispatcherController } from './dispatcher.controller';
import { DispatcherService } from './dispatcher.service';

describe('DispatcherController', () => {
  let controller: DispatcherController;

  const mockDispatcherService = {
    // mock methods here
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DispatcherController],
      providers: [
        {
          provide: DispatcherService,
          useValue: mockDispatcherService,
        },
      ],
    }).compile();

    controller = module.get<DispatcherController>(DispatcherController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
