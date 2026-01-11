import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { WhatsappCommercialService } from './whatsapp-commercial.service';
import { CreateWhatsappCommercialDto } from './dto/create-whatsapp-commercial.dto';
import { UpdateWhatsappCommercialDto } from './dto/update-whatsapp-commercial.dto';

@WebSocketGateway()
export class WhatsappCommercialGateway {
  constructor(private readonly whatsappCommercialService: WhatsappCommercialService) {}

  @SubscribeMessage('createWhatsappCommercial')
  create(@MessageBody() createWhatsappCommercialDto: CreateWhatsappCommercialDto) {
    return this.whatsappCommercialService.create(createWhatsappCommercialDto);
  }

  @SubscribeMessage('findAllWhatsappCommercial')
  findAll() {
    return this.whatsappCommercialService.findAll();
  }

  @SubscribeMessage('findOneWhatsappCommercial')
  findOne(@MessageBody() id: number) {
    return this.whatsappCommercialService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappCommercial')
  update(@MessageBody() updateWhatsappCommercialDto: UpdateWhatsappCommercialDto) {
    return this.whatsappCommercialService.update(updateWhatsappCommercialDto.id, updateWhatsappCommercialDto);
  }

  @SubscribeMessage('removeWhatsappCommercial')
  remove(@MessageBody() id: number) {
    return this.whatsappCommercialService.remove(id);
  }
}
