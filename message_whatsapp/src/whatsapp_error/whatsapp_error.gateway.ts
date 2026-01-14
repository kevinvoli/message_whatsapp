import { WhatsappErrorService } from './whatsapp_error.service';
import { CreateWhatsappErrorDto } from './dto/create-whatsapp_error.dto';
import { UpdateWhatsappErrorDto } from './dto/update-whatsapp_error.dto';
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappErrorGateway {
  constructor(private readonly whatsappErrorService: WhatsappErrorService) {}

  @SubscribeMessage('createWhatsappError')
  create(@MessageBody() createWhatsappErrorDto: CreateWhatsappErrorDto) {
    return this.whatsappErrorService.create(createWhatsappErrorDto);
  }

  @SubscribeMessage('findAllWhatsappError')
  findAll() {
    return this.whatsappErrorService.findAll();
  }

  @SubscribeMessage('findOneWhatsappError')
  findOne(@MessageBody() id: string) {
    return this.whatsappErrorService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappError')
  update(@MessageBody() updateWhatsappErrorDto: UpdateWhatsappErrorDto) {
    // return this.whatsappErrorService.update(updateWhatsappErrorDto.id, updateWhatsappErrorDto);
  }

  @SubscribeMessage('removeWhatsappError')
  remove(@MessageBody() id: string) {
    return this.whatsappErrorService.remove(id);
  }
}
