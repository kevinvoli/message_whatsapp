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
