import { Controller, Get, Post, Body,  Param } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';


@Controller('channel')
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
  update(@Param('id') id: string, @Body() updateCommunicationWhapiDto: any) {
    return this.communicationWhapiService.update(id, updateCommunicationWhapiDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.communicationWhapiService.remove(id);
  }
}
