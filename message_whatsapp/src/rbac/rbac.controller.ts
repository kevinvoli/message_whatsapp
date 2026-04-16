import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { RbacService, CreateRoleDto, UpdateRoleDto } from './rbac.service';

/**
 * P5.5 — Gestion des rôles et assignations (admin uniquement)
 */
@Controller('admin/roles')
@UseGuards(AdminGuard)
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Post()
  createRole(@Body() dto: CreateRoleDto) {
    return this.rbac.createRole(dto);
  }

  @Get()
  findAll(@Query('tenant_id') tenantId: string) {
    return this.rbac.findAllRoles(tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Query('tenant_id') tenantId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rbac.updateRole(id, tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.rbac.removeRole(id, tenantId);
  }

  /** Assigner un rôle à un commercial */
  @Post('assign')
  assign(
    @Body() body: { commercial_id: string; role_id: string; tenant_id: string },
  ) {
    return this.rbac.assignRole(body.commercial_id, body.role_id, body.tenant_id);
  }

  /** Retirer le rôle d'un commercial */
  @Delete('assign/:commercial_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAssignment(
    @Param('commercial_id') commercialId: string,
    @Query('tenant_id') tenantId: string,
  ) {
    return this.rbac.removeAssignment(commercialId, tenantId);
  }

  /** Consulter les permissions d'un commercial */
  @Get('permissions/:commercial_id')
  getPermissions(
    @Param('commercial_id') commercialId: string,
    @Query('tenant_id') tenantId: string,
  ) {
    return this.rbac.getPermissions(commercialId, tenantId);
  }
}
