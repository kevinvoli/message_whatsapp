import { Test, TestingModule } from '@nestjs/testing';
import { WhapiService } from './whapi.service';

describe('WhapiService', () => {
  let service: WhapiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhapiService],
    }).compile();

    service = module.get<WhapiService>(WhapiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
