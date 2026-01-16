import { Test, TestingModule } from '@nestjs/testing';
import { WhapiController } from './whapi.controller';
import { WhapiService } from './whapi.service';

describe('WhapiController', () => {
  let controller: WhapiController;

  const mockWhapiService = {
    handleWebhook: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhapiController],
      providers: [
        {
          provide: WhapiService,
          useValue: mockWhapiService,
        },
      ],
    }).compile();

    controller = module.get<WhapiController>(WhapiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
