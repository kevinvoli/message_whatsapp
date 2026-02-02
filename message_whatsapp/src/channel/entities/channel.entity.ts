import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
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
@Index('UQ_whapi_channel_id', ['channel_id'], {unique:true})
export class WhapiChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'channel_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  channel_id: string

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

  @OneToMany(() => WhatsappMedia, (media) => media.chat)
  medias: WhatsappMedia[];


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
