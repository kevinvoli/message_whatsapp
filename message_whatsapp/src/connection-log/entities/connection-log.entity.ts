import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ConnectionUserType = 'commercial' | 'admin';

@Entity({ name: 'messaging_connection_log' })
@Index('IDX_conn_log_user', ['userId', 'userType', 'loginAt'])
export class ConnectionLog {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: ['commercial', 'admin'], name: 'user_type' })
  userType: ConnectionUserType;

  @Column({ type: 'timestamp', name: 'login_at' })
  loginAt: Date;

  @Column({ type: 'timestamp', name: 'logout_at', nullable: true, default: null })
  logoutAt: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;
}
