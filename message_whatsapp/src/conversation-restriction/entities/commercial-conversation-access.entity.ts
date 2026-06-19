import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('commercial_conversation_access')
@Index('IDX_cca_commercial_date', ['commercialId', 'accessDate'])
@Index('UQ_cca_commercial_chat_date', ['commercialId', 'chatId', 'accessDate'], {
  unique: true,
})
export class CommercialConversationAccess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commercial_id' })
  commercialId: string;

  @Column({ name: 'chat_id' })
  chatId: string;

  @Column({ name: 'access_date', type: 'date' })
  accessDate: string; // YYYY-MM-DD

  @Column({ name: 'accessed_at', type: 'datetime' })
  accessedAt: Date;

  @Column({ name: 'responded_at', type: 'datetime', nullable: true })
  respondedAt: Date | null;

  @Column({ name: 'response_length', default: 0 })
  responseLength: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
