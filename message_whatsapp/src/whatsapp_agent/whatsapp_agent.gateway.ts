import { WhatsappAgentService } from './whatsapp_agent.service';
import { CreateWhatsappAgentDto } from './dto/create-whatsapp_agent.dto';
import { UpdateWhatsappAgentDto } from './dto/update-whatsapp_agent.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway()
export class WhatsappAgentGateway {
  constructor(private readonly whatsappAgentService: WhatsappAgentService) {}

  @SubscribeMessage('createWhatsappAgent')
  create(@MessageBody() createWhatsappAgentDto: CreateWhatsappAgentDto) {
    return this.whatsappAgentService.create(createWhatsappAgentDto);
  }

  @SubscribeMessage('findAllWhatsappAgent')
  findAll() {
    return this.whatsappAgentService.findAll();
  }

  @SubscribeMessage('findOneWhatsappAgent')
  findOne(@MessageBody() id: number) {
    return this.whatsappAgentService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappAgent')
  update(@MessageBody() updateWhatsappAgentDto: UpdateWhatsappAgentDto) {
    return this.whatsappAgentService.update(updateWhatsappAgentDto.id, updateWhatsappAgentDto);
  }

  @SubscribeMessage('removeWhatsappAgent')
  remove(@MessageBody() id: number) {
    return this.whatsappAgentService.remove(id);
  }
}
