import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappMessage {
@PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
  id: string;

  @Column({name:'external_id', type:'string', length:100, nullable:false, })
 external_id :string;

@Column({name:'conversation_id', type:'string', length:100, nullable:false, })
conversation_id :string

@Column({name:'direction', type:'string', length:100, nullable:false, })
direction: 'IN'| 'OUT'

@Column({name:'from_me', type:'bool', length:100, nullable:false, })
from_me :boolean

@Column({name:'sender_phone.', type:'string', length:100, nullable:false, })
sender_phone: string;

@Column({name:'sender_name', type:'string', length:100, nullable:false, })
sender_name:string;

@Column({name:'timestamp', type:'timestamp', length:100, nullable:false, })
timestamp:Date;

@Column({name:'status', type:'enum', length:100, nullable:false, })
status :  'failed'| 'pending'| 'sent'| 'delivered' | 'read' | 'played'| 'deleted';

@Column({name:'source', type:'string', length:100, nullable:false, })
source : string

@CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
  createdAt: Date;

@UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
updatedAt: Date;

@DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
deletedAt: Date | null;
}
