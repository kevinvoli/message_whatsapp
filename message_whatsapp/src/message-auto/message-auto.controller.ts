import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { MessageAutoService } from './message-auto.service';
import { CreateMessageAutoDto } from './dto/create-message-auto.dto';
import { UpdateMessageAutoDto } from './dto/update-message-auto.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('message-auto')
@UseGuards(AuthGuard('jwt'))
export class MessageAutoController {
  constructor(private readonly messageAutoService: MessageAutoService) {}

  @Post()
  create(@Body() createMessageAutoDto: CreateMessageAutoDto) {
    return this.messageAutoService.create(createMessageAutoDto);
  }

  @Get()
  findAll() {
    return this.messageAutoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.messageAutoService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMessageAutoDto: UpdateMessageAutoDto) {
    return this.messageAutoService.update(id, updateMessageAutoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.messageAutoService.remove(id);
  }
}
