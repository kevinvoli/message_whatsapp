import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type NotificationType = 'message' | 'queue' | 'alert' | 'info';

@Entity('admin_notification')
// filtre "non lues" + tri chronologique pour le panneau d'admin
@Index('IDX_notification_read_created', ['read', 'createdAt'])
export class AdminNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
