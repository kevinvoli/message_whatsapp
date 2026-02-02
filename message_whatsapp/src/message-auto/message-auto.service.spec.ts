import { Test, TestingModule } from '@nestjs/testing';
import { MessageAutoService } from './message-auto.service';

describe('MessageAutoService', () => {
  let service: MessageAutoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageAutoService],
    }).compile();

    service = module.get<MessageAutoService>(MessageAutoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
