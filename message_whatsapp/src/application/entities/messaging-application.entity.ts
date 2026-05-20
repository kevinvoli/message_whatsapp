import { WhapiChannel } from 'src/channel/entities/channel.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'messaging_applications' })
export class MessagingApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ type: 'varchar', length: 32, default: 'meta' })
  provider: string;

  @Column({ name: 'app_id', type: 'varchar', length: 64 })
  appId: string;

  @Column({ name: 'app_secret', type: 'varchar', length: 128 })
  appSecret: string;

  /** Token System User Meta (permanent). NULL = chaque canal gère son propre token. */
  @Column({ name: 'system_token', type: 'text', nullable: true })
  systemToken?: string | null;

  @OneToMany(() => WhapiChannel, (channel) => channel.application)
  channels: WhapiChannel[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
