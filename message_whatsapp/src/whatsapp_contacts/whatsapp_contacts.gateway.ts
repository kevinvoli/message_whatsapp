
import { WhatsappContactsService } from './whatsapp_contacts.service';
import { CreateWhatsappContactDto } from './dto/create-whatsapp_contact.dto';
import { UpdateWhatsappContactDto } from './dto/update-whatsapp_contact.dto';
import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';

@WebSocketGateway()
export class WhatsappContactsGateway {
  constructor(private readonly whatsappContactsService: WhatsappContactsService) {}

  @SubscribeMessage('createWhatsappContact')
  create(@MessageBody() createWhatsappContactDto: CreateWhatsappContactDto) {
    return this.whatsappContactsService.create(createWhatsappContactDto);
  }

  @SubscribeMessage('findAllWhatsappContacts')
  findAll() {
    return this.whatsappContactsService.findAll();
  }

  @SubscribeMessage('findOneWhatsappContact')
  findOne(@MessageBody() id: string) {
    return this.whatsappContactsService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappContact')
  update(@MessageBody() updateWhatsappContactDto: UpdateWhatsappContactDto) {
    // return this.whatsappContactsService.update(updateWhatsappContactDto.id, updateWhatsappContactDto);
  }

  @SubscribeMessage('removeWhatsappContact')
  remove(@MessageBody() id: string) {
    return this.whatsappContactsService.remove(id);
  }
}
