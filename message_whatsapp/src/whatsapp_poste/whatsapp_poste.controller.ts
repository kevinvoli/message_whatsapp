import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { WhatsappPosteService } from './whatsapp_poste.service';
import { CreateWhatsappPosteDto } from './dto/create-whatsapp_poste.dto';
import { UpdateWhatsappPosteDto } from './dto/update-whatsapp_poste.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('poste')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class WhatsappPosteController {
  constructor(private readonly whatsappPosteService: WhatsappPosteService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() createWhatsappPosteDto: CreateWhatsappPosteDto) {
    return this.whatsappPosteService.create(createWhatsappPosteDto);
  }

  @Get()
  @Roles('ADMIN')
  findAll() {
    return this.whatsappPosteService.findAll();
  }


  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() updateWhatsappPosteDto: UpdateWhatsappPosteDto) {
    return this.whatsappPosteService.update(id, updateWhatsappPosteDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.whatsappPosteService.remove(id);
  }
}
