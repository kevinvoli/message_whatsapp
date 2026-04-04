import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ChannelService } from './channel.service';
import { MetaTokenService } from './meta-token.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { AssignPosteDto } from './dto/assign-poste.dto';
import { AdminGuard } from '../auth/admin.guard'; // Import AdminGuard

@Controller('channel')
@UseGuards(AdminGuard) // Use AdminGuard
export class ChannelController {
  private readonly logger = new Logger(ChannelController.name);

  constructor(
    private readonly communicationWhapiService: ChannelService,
    private readonly metaTokenService: MetaTokenService,
  ) {}

  @Post()
  create(@Body() createCommunicationWhapiDto: CreateChannelDto) {
    return this.communicationWhapiService.create(createCommunicationWhapiDto);
  }

  @Get()
  findAll() {
    return this.communicationWhapiService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.communicationWhapiService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCommunicationWhapiDto: UpdateChannelDto,
  ) {
    return this.communicationWhapiService.update(
      id,
      updateCommunicationWhapiDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.communicationWhapiService.remove(id);
  }

  @Patch(':id/assign-poste')
  assignPoste(
    @Param('id') channelId: string,
    @Body() dto: AssignPosteDto,
  ) {
    return this.communicationWhapiService.assignPoste(channelId, dto.poste_id ?? null);
  }

  @Post(':id/refresh-token')
  async refreshToken(@Param('id') id: string) {
    try {
      return await this.metaTokenService.refreshChannelToken(id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`refresh-token failed for channel ${id}: ${message}`);
      throw new BadRequestException(message);
    }
  }
}
