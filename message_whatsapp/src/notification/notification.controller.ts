import { Controller, Delete, Get, MessageEvent, Param, Patch, Query, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AdminGuard } from 'src/auth/admin.guard';
import { NotificationService } from './notification.service';

@Controller('api/notifications')
@UseGuards(AdminGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** SSE — flux temps réel des nouvelles notifications */
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.notificationService.stream$;
  }

  /** Liste paginée des notifications */
  @Get()
  findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.notificationService.findAll(
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /** Nombre de notifications non lues */
  @Get('unread-count')
  unreadCount() {
    return this.notificationService.unreadCount().then((count) => ({ count }));
  }

  /** Marquer une notification comme lue */
  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationService.markAsRead(id);
  }

  /** Marquer toutes comme lues */
  @Patch('read-all')
  markAllAsRead() {
    return this.notificationService.markAllAsRead();
  }

  /** Supprimer toutes les notifications */
  @Delete()
  clearAll() {
    return this.notificationService.clearAll();
  }
}
