import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Put } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Permissions } from '../common/decorators/permissions.decorator';

import { PermissionsGuard } from '../auth/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
    @Permissions('create:roles', 'manage:roles')
  @Post()
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  // @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @Permissions('read:roles', 'manage:roles')
  @Get()
  findAll() {
    console.log("les role");
    
    return this.rolesService.findAll();
  }

  // @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @Permissions('read:roles', 'manage:roles')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(+id);
  }

  // @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @Permissions('update:roles', 'manage:roles')
  @Put(':id')
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(+id, updateRoleDto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('delete:roles')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolesService.remove(+id);
  }
}
