
import { Entity, Column, PrimaryGeneratedColumn,CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity()
export class WhatsappCommercial {
  @PrimaryGeneratedColumn('uuid', {
    name: 'id',
    comment: 'Primary key - Unique trajet identifier',
  })
  id: string;

  @Column({ type: 'varchar', name: 'email', unique: true, nullable:true })
  email: string;

  @Column({ type: 'varchar', nullable: false })
  name: string ;

  @Column({ type: 'varchar', nullable: false, select: false })
  password: string;

  @Column({ type: 'enum', enum: ['ADMIN', 'COMMERCIAL'], default: 'COMMERCIAL' })
  role: string;

  @Column({ type: 'varchar', nullable: true })
  passwordResetToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpires?: Date | null;

  @Column({ type: 'boolean', default: false })
  isConnected: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastConnectionAt: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deleted_at?: Date;
 
}
