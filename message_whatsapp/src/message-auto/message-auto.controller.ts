import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { MessageAutoService } from './message-auto.service';
import { CreateMessageAutoDto } from './dto/create-message-auto.dto';
import { UpdateMessageAutoDto } from './dto/update-message-auto.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('message-auto')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class MessageAutoController {
  constructor(private readonly messageAutoService: MessageAutoService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() createMessageAutoDto: CreateMessageAutoDto) {
    return this.messageAutoService.create(createMessageAutoDto);
  }

  @Get()
  @Roles('ADMIN')
  findAll() {
    return this.messageAutoService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN')
  findOne(@Param('id') id: string) {
    return this.messageAutoService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() updateMessageAutoDto: UpdateMessageAutoDto) {
    return this.messageAutoService.update(id, updateMessageAutoDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.messageAutoService.remove(id);
  }
}
