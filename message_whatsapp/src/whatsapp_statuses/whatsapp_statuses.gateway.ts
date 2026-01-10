import { WhatsappStatusesService } from './whatsapp_statuses.service';
import { CreateWhatsappStatusDto } from './dto/create-whatsapp_status.dto';
import { UpdateWhatsappStatusDto } from './dto/update-whatsapp_status.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway()
export class WhatsappStatusesGateway {
  constructor(private readonly whatsappStatusesService: WhatsappStatusesService) {}

  @SubscribeMessage('createWhatsappStatus')
  create(@MessageBody() createWhatsappStatusDto: CreateWhatsappStatusDto) {
    return this.whatsappStatusesService.create(createWhatsappStatusDto);
  }

  @SubscribeMessage('findAllWhatsappStatuses')
  findAll() {
    return this.whatsappStatusesService.findAll();
  }

  @SubscribeMessage('findOneWhatsappStatus')
  findOne(@MessageBody() id: number) {
    return this.whatsappStatusesService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappStatus')
  update(@MessageBody() updateWhatsappStatusDto: UpdateWhatsappStatusDto) {
    return this.whatsappStatusesService.update(updateWhatsappStatusDto.id, updateWhatsappStatusDto);
  }

  @SubscribeMessage('removeWhatsappStatus')
  remove(@MessageBody() id: number) {
    return this.whatsappStatusesService.remove(id);
  }
}
