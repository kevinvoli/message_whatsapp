import { Test, TestingModule } from '@nestjs/testing';
import { CommunicationWhapiController } from './communication_whapi.controller';
import { CommunicationWhapiService } from './communication_whapi.service';

describe('CommunicationWhapiController', () => {
  let controller: CommunicationWhapiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunicationWhapiController],
      providers: [CommunicationWhapiService],
    }).compile();

    controller = module.get<CommunicationWhapiController>(CommunicationWhapiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
