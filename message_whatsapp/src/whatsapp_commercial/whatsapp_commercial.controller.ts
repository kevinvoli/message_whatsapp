import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { WhatsappCommercialService } from './whatsapp_commercial.service';
import { CreateWhatsappCommercialDto } from './dto/create-whatsapp_commercial.dto';
import { UpdateWhatsappCommercialDto } from './dto/update-whatsapp_commercial.dto';

@Controller('whatsapp_commercial')
export class WhatsappCommercialController {
  constructor(
    private readonly whatsappCommercialService: WhatsappCommercialService,
  ) {}

  @Post()
  create(@Body() createWhatsappCommercialDto: CreateWhatsappCommercialDto) {
    return this.whatsappCommercialService.create(createWhatsappCommercialDto);
  }

  @Get()
  findAll() {
    return this.whatsappCommercialService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    console.log('get on user', id);
    return this.whatsappCommercialService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateWhatsappCommercialDto: UpdateWhatsappCommercialDto,
  ) {
    return this.whatsappCommercialService.update(
      id,
      updateWhatsappCommercialDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.whatsappCommercialService.remove(id);
  }
}
