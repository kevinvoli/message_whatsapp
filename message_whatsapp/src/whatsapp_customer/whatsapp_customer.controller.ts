import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { WhatsappCustomerService } from './whatsapp_customer.service';
import { CreateWhatsappCustomerDto } from './dto/create-whatsapp_customer.dto';
import { UpdateWhatsappCustomerDto } from './dto/update-whatsapp_customer.dto';

@Controller('whatsapp-customer')
export class WhatsappCustomerController {
  constructor(private readonly whatsappCustomerService: WhatsappCustomerService) {}

  @Post()
  create(@Body() createWhatsappCustomerDto: CreateWhatsappCustomerDto) {
    return this.whatsappCustomerService.create(createWhatsappCustomerDto);
  }

  @Get()
  findAll() {
    return this.whatsappCustomerService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.whatsappCustomerService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWhatsappCustomerDto: UpdateWhatsappCustomerDto) {
    return this.whatsappCustomerService.update(id, updateWhatsappCustomerDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.whatsappCustomerService.remove(id);
  }
}