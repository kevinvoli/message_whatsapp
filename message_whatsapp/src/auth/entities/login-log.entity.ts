import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type OtpStatus = 'none' | 'sent' | 'verified' | 'failed';

@Entity('login_log')
export class LoginLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_login_log_user')
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  userName: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  posteId: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  device: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  localisation: string | null;

  @Column({ type: 'enum', enum: ['none', 'sent', 'verified', 'failed'], default: 'none' })
  otpStatus: OtpStatus;

  @Index('IDX_login_log_login_at')
  @CreateDateColumn({ type: 'timestamp', name: 'login_at' })
  loginAt: Date;
}
