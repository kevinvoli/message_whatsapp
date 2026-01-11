import { WhatsappConversation } from 'src/whatsapp_conversation/entities/whatsapp_conversation.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index('UQ_whatsapp_customer_customer_id', ['customer_id'], { unique: true })
export class WhatsappCustomer {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({
    name: 'customer_id',
    type: 'varchar',
    length: 100,
    nullable: false,
    unique: true,
  })
  customer_id: string;

  @Column({ name: 'phone', type: 'varchar', length: 100, nullable: false })
  phone: string;

  @Column({ name: 'name', type: 'varchar', length: 100, nullable: false })
  name: string;

  @OneToMany(() => WhatsappConversation, (data) => data.customer)
  conversation: WhatsappConversation[];

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
