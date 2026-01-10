import { Injectable } from '@nestjs/common';
import { UpdateWhatsappAgentDto } from './dto/update-whatsapp_agent.dto';
import { WhatsappAgent } from './entities/whatsapp_agent.entity';

@Injectable()
export class WhatsappAgentService {
  async  create(createWhatsappAgentDto: Partial<WhatsappAgent>) {

    return 'This action adds a new whatsappAgent';
  }

   assignAgent() {
    return `This action returns all whatsappAgent`;
  }

  findAll() {
    return `This action returns all whatsappAgent`;
  }


  findOne(id: number) {
    
    return `This action returns a #${id} whatsappAgent`;
  }

  update(id: number, updateWhatsappAgentDto:  Partial<WhatsappAgent>) {
    return `This action updates a #${id} whatsappAgent`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsappAgent`;
  }
}
