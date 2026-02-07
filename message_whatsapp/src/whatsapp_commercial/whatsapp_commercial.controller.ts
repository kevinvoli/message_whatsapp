import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { WhatsappCommercialService } from './whatsapp_commercial.service';
import { CreateWhatsappCommercialDto } from './dto/create-whatsapp_commercial.dto';
import { UpdateWhatsappCommercialDto } from './dto/update-whatsapp_commercial.dto';
import { AdminGuard } from '../auth/admin.guard'; // Import AdminGuard


@Controller('users')
@UseGuards(AdminGuard) // Use AdminGuard
export class WhatsappCommercialController {
  constructor(private readonly whatsappCommercialService: WhatsappCommercialService) {}

  @Post()
  async create(@Body() createWhatsappCommercialDto: CreateWhatsappCommercialDto) {
    return await this.whatsappCommercialService.create(createWhatsappCommercialDto);
  }

  @Get()
  async findAll() {
    return await this.whatsappCommercialService.getCommercialsDashboard();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    console.log("get on user", id);
    return await this.whatsappCommercialService.findOne(id);
  }

  @Patch(':id')
 async update(@Param('id') id: string, @Body() updateWhatsappCommercialDto: UpdateWhatsappCommercialDto) {
  console.log("tentative de modification", updateWhatsappCommercialDto);
  
    return await this.whatsappCommercialService.update(id, updateWhatsappCommercialDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.whatsappCommercialService.remove(id);
  }
}
