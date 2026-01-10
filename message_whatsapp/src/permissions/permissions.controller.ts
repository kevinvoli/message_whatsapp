
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Controller, Get, Post, Body, Param, Delete, UseGuards, Put } from '@nestjs/common';
import { Permissions } from 'src/common/decorators/permissions.decorator';


@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
    @Permissions('create:permissions')
  @Post()
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.create(createPermissionDto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
    @Permissions('read:permissions')
  @Get()
  findAll() {
    return this.permissionsService.findAll();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('read:permissions')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('update:permissions')
  @Put(':id')
  update(@Param('id') id: string, @Body() updatePermissionDto: UpdatePermissionDto) {
    return this.permissionsService.update(+id, updatePermissionDto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('delete:permissions')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.permissionsService.remove(+id);
  }
}
