import { Injectable } from '@nestjs/common';
import { WhatsappAgent } from './entities/whatsapp_agent.entity';

@Injectable()
export class WhatsappAgentService {
    create(createWhatsappAgentDto: Partial<WhatsappAgent>) {

    return 'This action adds a new whatsappAgent';
  }

   assignAgent() {
    return `This action returns all whatsappAgent`;
  }

  findAll() {
    return `This action returns all whatsappAgent`;
  }


  findOne(id: string) {

    return `This action returns a #${id} whatsappAgent`;
  }

  update(id: string, updateWhatsappAgentDto:  Partial<WhatsappAgent>) {
    return `This action updates a #${id} whatsappAgent`;
  }

  remove(id: string) {
    return `This action removes a #${id} whatsappAgent`;
  }
}
