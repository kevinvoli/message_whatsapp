import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';


@Controller('channel')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ChannelController {
  constructor(private readonly communicationWhapiService: ChannelService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() createCommunicationWhapiDto: CreateChannelDto) {
    return this.communicationWhapiService.create(createCommunicationWhapiDto);
  }

  @Get()
  @Roles('ADMIN')
  findAll() {
    return this.communicationWhapiService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN')
  findOne(@Param('id') id: string) {
    return this.communicationWhapiService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() updateCommunicationWhapiDto: UpdateChannelDto) {
    return this.communicationWhapiService.update(id, updateCommunicationWhapiDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.communicationWhapiService.remove(id);
  }
}
