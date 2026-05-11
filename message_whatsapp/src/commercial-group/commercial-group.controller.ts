import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CommercialGroupService } from './commercial-group.service';
import { AdminGuard } from 'src/auth/admin.guard';
import { AddMemberDto, CreateCommercialGroupDto, UpdateCommercialGroupDto } from './dto/commercial-group.dto';

@Controller('commercial-groups')
@UseGuards(AdminGuard)
export class CommercialGroupController {
  constructor(private readonly service: CommercialGroupService) {}

  @Post()
  create(@Body() body: CreateCommercialGroupDto) {
    return this.service.create(body);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCommercialGroupDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() body: AddMemberDto) {
    return this.service.addMember(id, body.commercialId);
  }

  @Delete(':id/members/:commercialId')
  removeMember(@Param('id') id: string, @Param('commercialId') commercialId: string) {
    return this.service.removeMember(id, commercialId);
  }
}
