import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappConversation {

  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
  id: string;
   @Column({name:'conversation_id', type:'string', length:100, nullable:false, })
  conversation_id:string

 @Column({name:'customer_id', type:'string', length:100, nullable:false, })
customer_id:string; 

@Column({name:'assigned_agent_id', type:'string', length:100, nullable:false, })
assigned_agent_id : string;

@Column({name:'status', type:'string', length:100, nullable:false, })
status: 'open' |'close';

@Column({name:'started_at', type:'timestamp', length:100, nullable:false, })
started_at: Date;

@Column({name:'closed_at', type:'string', length:100, nullable:false, })
closed_at: Date;

@CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
  createdAt: Date;

@UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
updatedAt: Date;

@DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
deletedAt: Date | null;
}
