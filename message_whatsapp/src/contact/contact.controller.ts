import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ContactService } from './contact.service';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto'; // Added import
import { UpdateContactCallDto } from './dto/update-contact-call.dto';
import { AdminGuard } from '../auth/admin.guard'; // Added import
import { AuthGuard } from '@nestjs/passport';

@Controller('contact')
export class ContactController {
  constructor(private readonly service: ContactService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateContactDto) {
    return this.service.create(dto);
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
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/call-status')
  @UseGuards(AuthGuard('jwt'))
  updateCallStatus(@Param('id') id: string, @Body() dto: UpdateContactCallDto) {
    return this.service.updateCallStatus(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
