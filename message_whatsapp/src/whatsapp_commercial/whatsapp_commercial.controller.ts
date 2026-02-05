import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { WhatsappCommercialService } from './whatsapp_commercial.service';
import { CreateWhatsappCommercialDto } from './dto/create-whatsapp_commercial.dto';
import { UpdateWhatsappCommercialDto } from './dto/update-whatsapp_commercial.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';


@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class WhatsappCommercialController {
  constructor(private readonly whatsappCommercialService: WhatsappCommercialService) {}

  @Post()
  @Roles('ADMIN')
  async create(@Body() createWhatsappCommercialDto: CreateWhatsappCommercialDto) {
    return await this.whatsappCommercialService.create(createWhatsappCommercialDto);
  }

  @Get()
  @Roles('ADMIN')
  async findAll() {
    return await this.whatsappCommercialService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN')
  async findOne(@Param('id') id: string) {
    console.log("get on user", id);
    return await this.whatsappCommercialService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
 async update(@Param('id') id: string, @Body() updateWhatsappCommercialDto: UpdateWhatsappCommercialDto) {
  console.log("tentative de modification", updateWhatsappCommercialDto);
  
    return await this.whatsappCommercialService.update(id, updateWhatsappCommercialDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(@Param('id') id: string) {
    return await this.whatsappCommercialService.remove(id);
  }
}
