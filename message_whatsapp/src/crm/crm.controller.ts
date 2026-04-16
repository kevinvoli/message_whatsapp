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
import { CrmService } from './crm.service';
import {
  CreateFieldDefinitionDto,
  UpdateFieldDefinitionDto,
  SetContactFieldValuesDto,
} from './dto/crm.dto';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';

/** Admin — gestion du schéma CRM */
@Controller('admin/crm/fields')
@UseGuards(AdminGuard)
export class CrmAdminController {
  constructor(private readonly service: CrmService) {}

  @Post()
  create(@Body() dto: CreateFieldDefinitionDto) {
    return this.service.createDefinition(dto);
  }

  @Get()
  findAll(@Query('tenant_id') tenantId: string) {
    return this.service.findAllDefinitions(tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Query('tenant_id') tenantId: string,
    @Body() dto: UpdateFieldDefinitionDto,
  ) {
    return this.service.updateDefinition(id, tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.removeDefinition(id, tenantId);
  }
}

/** Agent (JWT) — lecture + écriture des valeurs CRM sur les contacts */
@Controller('contacts/:contact_id/crm-fields')
@UseGuards(AuthGuard('jwt'))
export class CrmAgentController {
  constructor(private readonly service: CrmService) {}

  @Get()
  getFields(
    @Param('contact_id') contactId: string,
    @Query('tenant_id') tenantId: string,
  ) {
    return this.service.getContactFields(contactId, tenantId);
  }

  @Post()
  setFields(
    @Param('contact_id') contactId: string,
    @Query('tenant_id') tenantId: string,
    @Body() dto: SetContactFieldValuesDto,
  ) {
    return this.service.setContactFields(contactId, tenantId, dto);
  }
}

/** Admin — lecture + écriture des valeurs CRM */
@Controller('admin/contacts/:contact_id/crm-fields')
@UseGuards(AdminGuard)
export class CrmAdminFieldsController {
  constructor(private readonly service: CrmService) {}

  @Get()
  getFields(
    @Param('contact_id') contactId: string,
    @Query('tenant_id') tenantId: string,
  ) {
    return this.service.getContactFields(contactId, tenantId);
  }

  @Post()
  setFields(
    @Param('contact_id') contactId: string,
    @Query('tenant_id') tenantId: string,
    @Body() dto: SetContactFieldValuesDto,
  ) {
    return this.service.setContactFields(contactId, tenantId, dto);
  }
}
