import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { WhatsappPosteService } from './whatsapp_poste.service';
import { CreateWhatsappPosteDto } from './dto/create-whatsapp_poste.dto';
import { UpdateWhatsappPosteDto } from './dto/update-whatsapp_poste.dto';
import { AdminGuard } from '../auth/admin.guard'; // Import AdminGuard

@Controller('poste')
@UseGuards(AdminGuard) // Use AdminGuard
export class WhatsappPosteController {
  constructor(private readonly whatsappPosteService: WhatsappPosteService) {}

  @Post()
  create(@Body() createWhatsappPosteDto: CreateWhatsappPosteDto) {
    return this.whatsappPosteService.create(createWhatsappPosteDto);
  }

  @Get()
  findAll() {
    return this.whatsappPosteService.findAll();
  }


  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWhatsappPosteDto: UpdateWhatsappPosteDto) {
    return this.whatsappPosteService.update(id, updateWhatsappPosteDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.whatsappPosteService.remove(id);
  }
}
