import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappPosteController } from './whatsapp_poste.controller';
import { WhatsappPosteService } from './whatsapp_poste.service';

describe('WhatsappPosteController', () => {
  let controller: WhatsappPosteController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappPosteController],
      providers: [WhatsappPosteService],
    }).compile();

    controller = module.get<WhatsappPosteController>(WhatsappPosteController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
