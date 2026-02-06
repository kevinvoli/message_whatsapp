import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { AdminGuard } from '../auth/admin.guard'; // Import AdminGuard


@Controller('channel')
@UseGuards(AdminGuard) // Use AdminGuard
export class ChannelController {
  constructor(private readonly communicationWhapiService: ChannelService) {}

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
  update(@Param('id') id: string, @Body() updateCommunicationWhapiDto: UpdateChannelDto) {
    return this.communicationWhapiService.update(id, updateCommunicationWhapiDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.communicationWhapiService.remove(id);
  }
}
