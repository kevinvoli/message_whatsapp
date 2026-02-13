import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ContactService } from './contact.service';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto'; // Added import
import { UpdateContactCallDto } from './dto/update-contact-call.dto';
import { AdminGuard } from '../auth/admin.guard'; // Added import
import { AuthGuard } from '@nestjs/passport';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';

@Controller('contact')
export class ContactController {
  constructor(
    private readonly service: ContactService,
    private readonly gateway: WhatsappMessageGateway,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() dto: CreateContactDto) {
    const contact = await this.service.create(dto);
    await this.gateway.emitContactUpsert(contact);
    return contact;
  }

  @Get()
  @UseGuards(AdminGuard)
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    const contact = await this.service.update(id, dto);
    await this.gateway.emitContactUpsert(contact);
    return contact;
  }

  @Patch(':id/call-status')
  @UseGuards(AuthGuard('jwt'))
  async updateCallStatus(
    @Param('id') id: string,
    @Body() dto: UpdateContactCallDto,
  ) {
    const contact = await this.service.updateCallStatus(id, dto);
    await this.gateway.emitContactCallStatusUpdated(contact);
    return contact;
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async remove(@Param('id') id: string) {
    const contact = await this.service.remove(id);
    await this.gateway.emitContactRemoved(contact);
    return contact;
  }
}
