import { Test, TestingModule } from '@nestjs/testing';
import { MessageAutoController } from './message-auto.controller';
import { MessageAutoService } from './message-auto.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('MessageAutoController', () => {
  let controller: MessageAutoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessageAutoController],
      providers: [MessageAutoService],
    })
      .useMocker(createMocker)
      .compile();

    controller = module.get<MessageAutoController>(MessageAutoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
