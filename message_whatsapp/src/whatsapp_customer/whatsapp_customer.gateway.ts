import { WhatsappCustomerService } from './whatsapp_customer.service';
import { CreateWhatsappCustomerDto } from './dto/create-whatsapp_customer.dto';
import { UpdateWhatsappCustomerDto } from './dto/update-whatsapp_customer.dto';
import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';


@WebSocketGateway({
  cors: { origin: '*' },
})
export class WhatsappCustomerGateway {
  constructor(private readonly whatsappCustomerService: WhatsappCustomerService) {}

  @SubscribeMessage('createWhatsappCustomer')
  create(@MessageBody() createWhatsappCustomerDto: CreateWhatsappCustomerDto) {
    return this.whatsappCustomerService.create(createWhatsappCustomerDto);
  }

  @SubscribeMessage('findAllWhatsappCustomer')
  findAll() {
    return this.whatsappCustomerService.findAll();
  }

  @SubscribeMessage('findOneWhatsappCustomer')
  findOne(@MessageBody() id: string) {
    return this.whatsappCustomerService.findOne(id);
  }

  @SubscribeMessage('updateWhatsappCustomer')
  update(@MessageBody() updateWhatsappCustomerDto: UpdateWhatsappCustomerDto) {
    // return this.whatsappCustomerService.update(updateWhatsappCustomerDto.id, updateWhatsappCustomerDto);
  }

  @SubscribeMessage('removeWhatsappCustomer')
  remove(@MessageBody() id: string) {
    return this.whatsappCustomerService.remove(id);
  }
}
