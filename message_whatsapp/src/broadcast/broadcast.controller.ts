import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { CreateBroadcastDto, AddRecipientsDto } from './dto/create-broadcast.dto';
import { RecipientStatus } from './entities/broadcast-recipient.entity';
import { AdminGuard } from 'src/auth/admin.guard';

/**
 * P4.3 — Endpoints Broadcasts
 * Tous les endpoints broadcast sont réservés à l'admin.
 */
@Controller('admin/broadcasts')
@UseGuards(AdminGuard)
export class BroadcastController {
  constructor(private readonly service: BroadcastService) {}

  
  @Post()
  create(@Body() dto: CreateBroadcastDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('tenant_id') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.getStats(id, tenantId);
  }

  @Get(':id/recipients')
  getRecipients(
    @Param('id') id: string,
    @Query('tenant_id') tenantId: string,
    @Query('status') status?: RecipientStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getRecipients(
      id,
      tenantId,
      status,
      limit ? Math.min(parseInt(limit, 10), 500) : 100,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post(':id/recipients')
  addRecipients(
    @Param('id') id: string,
    @Query('tenant_id') tenantId: string,
    @Body() dto: AddRecipientsDto,
  ) {
    return this.service.addRecipients(id, tenantId, dto);
  }

  @Post(':id/launch')
  launch(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.launch(id, tenantId);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.NO_CONTENT)
  pause(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.pause(id, tenantId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.cancel(id, tenantId);
  }
}
