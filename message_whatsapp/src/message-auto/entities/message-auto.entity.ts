// src/modules/auto-message/entities/message-auto.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  
} from 'typeorm';

export enum AutoMessageChannel {
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email',
}

@Entity({ name: 'messages_predefinis', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
export class MessageAuto {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ type: 'text', nullable: false })
  body: string;

  @Column({ type: 'int', default: 0 ,nullable:true})
  delai?: number |null;
 
  @Column({
    type: 'enum',
    enum: AutoMessageChannel,
    default: AutoMessageChannel.WHATSAPP,
    nullable:true
  })
  canal?: AutoMessageChannel| null;

  @Column({ type: 'int' ,nullable:false })
  position: number ;
 
  @Column({ type: 'boolean', default: true })
  actif: boolean;


  @Column({ type: 'json', nullable: true })
  conditions?: {
    poste_id?: string;
    channel_id?: string;
    client_type?: string;
    [key: string]: any;
  }| null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
