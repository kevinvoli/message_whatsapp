import { Test, TestingModule } from '@nestjs/testing';
import { ContactService } from './contact.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('ContactService', () => {
  let service: ContactService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactService],
    }).useMocker(createMocker).compile();

    service = module.get<ContactService>(ContactService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

