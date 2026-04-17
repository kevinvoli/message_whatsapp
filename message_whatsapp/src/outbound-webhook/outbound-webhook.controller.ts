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
import { OutboundWebhookService, CreateWebhookDto, UpdateWebhookDto } from './outbound-webhook.service';

/**
 * P6.3 — Gestion des webhooks sortants (admin uniquement)
 */
@Controller('admin/outbound-webhooks')
@UseGuards(AdminGuard)
export class OutboundWebhookController {
  constructor(private readonly service: OutboundWebhookService) {}

  @Post()
  create(@Body() dto: CreateWebhookDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('tenant_id') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Query('tenant_id') tenantId: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.service.update(id, tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.remove(id, tenantId);
  }

  @Get(':id/logs')
  getLogs(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.service.getLogs(id, limit ? parseInt(limit) : 50);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.service.testWebhook(id, tenantId);
  }

  @Post('logs/:logId/retry')
  retryLog(@Param('logId') logId: string) {
    return this.service.retryLog(logId);
  }
}
