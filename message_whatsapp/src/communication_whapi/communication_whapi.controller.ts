import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CommunicationWhapiService } from './communication_whapi.service';
import { CreateCommunicationWhapiDto } from './dto/create-communication_whapi.dto';
import { UpdateCommunicationWhapiDto } from './dto/update-communication_whapi.dto';

@Controller('communication-whapi')
export class CommunicationWhapiController {
  constructor(
    private readonly communicationWhapiService: CommunicationWhapiService,
  ) {}

  @Post()
  create(@Body() createCommunicationWhapiDto: CreateCommunicationWhapiDto) {
    return this.communicationWhapiService.create(createCommunicationWhapiDto);
  }

  @Get()
  findAll() {
    return this.communicationWhapiService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.communicationWhapiService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCommunicationWhapiDto: UpdateCommunicationWhapiDto,
  ) {
    return this.communicationWhapiService.update(
      +id,
      updateCommunicationWhapiDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.communicationWhapiService.remove(+id);
  }
}
