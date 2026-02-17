import { Test, TestingModule } from '@nestjs/testing';
import { ChannelService } from './channel.service';
import { createMocker } from 'src/test-utils/nest-mocker';

describe('ChannelService', () => {
  let service: ChannelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    })
      .useMocker(createMocker)
      .compile();

    service = module.get<ChannelService>(ChannelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
