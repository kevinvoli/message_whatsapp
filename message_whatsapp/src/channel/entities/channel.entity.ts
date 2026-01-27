import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('whapi_channels')
export class WhapiChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'channel_id', type: 'varchar', nullable: false })
  channel_id: string;

  @Index({ unique: true })
  @Column()
  token: string;

  @Column({ type: 'int' })
  start_at: number;

  @Column({ type: 'int' })
  uptime: number;

  // @Column(() => WhapiStatus)
  // status: WhapiStatus;

  @Column()
  version: string;

  @OneToMany(() => WhatsappMessage, (message) => message.channel)
  messages: WhatsappMessage[];

  @OneToMany(() => WhatsappChat, (message) => message.channel)
  chat: WhatsappChat[];

  // @Column(() => WhapiUser)
  // user: WhapiUser;

  @Column({ type: 'int' })
  device_id: number;

  @Column()
  ip: string;

  @Column({ default: false })
  is_business: boolean;

  @Column()
  api_version: string;

  @Column()
  core_version: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
