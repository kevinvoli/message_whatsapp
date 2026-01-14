import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pending_messages')
export class PendingMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'client_phone' })
  clientPhone: string;

  @Column({ name: 'client_name', nullable: true })
  clientName: string;

  @Column('text')
  content: string;

  @Column()
  type: string; // TEXT, IMAGE, DOCUMENT

  @Column({ name: 'media_url', nullable: true })
  mediaUrl: string;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt: Date;
}
