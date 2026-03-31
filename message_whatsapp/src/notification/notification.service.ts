import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject, Observable, map } from 'rxjs';
import { AdminNotification, NotificationType } from './entities/notification.entity';

@Injectable()
export class NotificationService {
  private readonly subject = new Subject<AdminNotification>();

  // Observable partagé pour le SSE — chaque abonné SSE reçoit les nouvelles notifs
  readonly stream$: Observable<MessageEvent> = this.subject.asObservable().pipe(
    map((n) => ({ data: n }) as MessageEvent),
  );

  constructor(
    @InjectRepository(AdminNotification)
    private readonly repo: Repository<AdminNotification>,
  ) {}

  async create(type: NotificationType, title: string, message: string): Promise<AdminNotification> {
    const notification = this.repo.create({ type, title, message });
    const saved = await this.repo.save(notification);
    this.subject.next(saved);
    return saved;
  }

  async findAll(limit = 50, offset = 0): Promise<{ data: AdminNotification[]; total: number }> {
    const [data, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  async unreadCount(): Promise<number> {
    return this.repo.count({ where: { read: false } });
  }

  async markAsRead(id: string): Promise<void> {
    await this.repo.update(id, { read: true });
  }

  async markAllAsRead(): Promise<void> {
    await this.repo.update({ read: false }, { read: true });
  }

  async clearAll(): Promise<void> {
    await this.repo.createQueryBuilder().delete().from(AdminNotification).execute();
  }
}
