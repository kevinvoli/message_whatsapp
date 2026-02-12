import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CallStatus {
  À_APPeler = 'à_appeler',
  Appelé = 'appelé',
  Rappeler = 'rappeler',
  Non_Joignable = 'non_joignable',
}
export enum Priority {
  Haute = 'haute',
  Moyenne = 'moyenne',
  Basse = 'basse',
}

@Entity()
export class Contact {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @Column({ name: 'contact', type: 'varchar', length: 100, nullable: false })
  phone: string;

  @Column({
    name: 'chat_id',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  chat_id?: string;

  // Informations d'appel
  @Column({
    name: 'call_status',
    type: 'enum',
    enum: CallStatus,
    default: CallStatus.À_APPeler,
  })
  call_status: CallStatus;

  @Column({ name: 'last_call_date', type: 'timestamp', nullable: true })
  last_call_date?: Date;

  @Column({
    name: 'last_call_outcome',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  last_call_outcome?: string;

  @Column({ name: 'next_call_date', type: 'timestamp', nullable: true })
  next_call_date?: Date;
  @Column({ name: 'call_count', type: 'int', default: 0 })
  call_count: number;

  @Column({ name: 'call_notes', type: 'text', nullable: true })
  call_notes?: string;

  // Statistiques
  @Column({ name: 'total_messages', type: 'int', default: 0 })
  total_messages?: number;

  @Column({ name: 'last_message_date', type: 'timestamp', nullable: true })
  last_message_date?: Date;
  @Column({
    name: 'conversion_status',
    type: 'enum',
    enum: ['nouveau', 'prospect', 'client', 'perdu'],
    default: 'nouveau',
  })
  conversion_status?: 'nouveau' | 'prospect' | 'client' | 'perdu';

  // Métadonnées
  @Column({ name: 'source', type: 'varchar', length: 100, nullable: true })
  source?: string;
  @Column({ name: 'priority', type: 'enum', enum: Priority, nullable: true })
  priority?: Priority;

  @OneToMany(() => WhatsappMessage, (message) => message.contact)
  messages: WhatsappMessage[];

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({
    name: 'createdAt',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Timestamp when the trajet was created',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updatedAt',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    comment: 'Timestamp when the trajet was last updated',
  })
  updatedAt: Date;

  @DeleteDateColumn({
    name: 'deletedAt',
    type: 'timestamp',
    nullable: true,
    comment: 'Timestamp when the trajet was deleted',
  })
  deletedAt: Date | null;
}
