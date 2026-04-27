import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { IntegrationOutboxService } from './integration-outbox.service';

@Controller('admin/outbox')
@UseGuards(AdminGuard)
export class OutboxAdminController {
  constructor(private readonly outboxService: IntegrationOutboxService) {}

  @Get('stats')
  async getStats() {
    const stats = await this.outboxService.getStats();
    const stalePending = await this.outboxService.getStalePendingCount(10);
    return { stats, stalePendingCount: stalePending };
  }

  @Get('failed')
  async getFailedEntries(
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    return this.outboxService.getFailedEntries(Number(limit), Number(offset));
  }

  @Post(':id/retry')
  async retryEntry(@Param('id') id: string) {
    const entry = await this.outboxService.requeueEntry(id);
    return { success: true, id: entry.id, status: entry.status };
  }
}
