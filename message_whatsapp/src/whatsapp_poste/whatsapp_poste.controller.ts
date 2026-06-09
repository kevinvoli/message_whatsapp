import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import { WhatsappPosteService } from './whatsapp_poste.service';
import { CreateWhatsappPosteDto } from './dto/create-whatsapp_poste.dto';
import { UpdateWhatsappPosteDto } from './dto/update-whatsapp_poste.dto';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';
import { UpdatePostePanelDto } from './dto/update-poste-panel.dto';

@Controller('poste')
export class WhatsappPosteController {
  constructor(private readonly whatsappPosteService: WhatsappPosteService) {}

  // IMPORTANT: 'poste-panel/media' doit etre declare AVANT ':id/panel'
  // pour eviter que NestJS interprete 'poste-panel' comme un :id

  @Get('poste-panel/media')
  @UseGuards(AuthGuard('jwt'))
  async getMyPanelMedia(
    @Request() req: { user: { userId: string } },
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    return this.whatsappPosteService.getPanelMediaForCommercial(req.user.userId, +page, +limit);
  }

  @Get(':id/panel')
  @UseGuards(AdminGuard)
  async getPanelConfig(@Param('id') id: string) {
    return this.whatsappPosteService.getPanelConfig(id);
  }

  @Put(':id/panel')
  @UseGuards(AdminGuard)
  async updatePanelConfig(@Param('id') id: string, @Body() dto: UpdatePostePanelDto) {
    await this.whatsappPosteService.updatePanelConfig(id, dto);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createWhatsappPosteDto: CreateWhatsappPosteDto) {
    return this.whatsappPosteService.create(createWhatsappPosteDto);
  }

  @Get()
  @UseGuards(AdminGuard)
  async findAll() {
    return await this.whatsappPosteService.findAll();
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateWhatsappPosteDto: UpdateWhatsappPosteDto,
  ) {
    return this.whatsappPosteService.update(id, updateWhatsappPosteDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.whatsappPosteService.remove(id);
  }
}
