import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappMessageEvent {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
    id: string;
  
    @Column({name:'message_event_id', type:'string', length:100, nullable:false, })
     message_event_id:string;

    @Column({name:'message_id', type:'string', length:100, nullable:false, })
 message_id :string;

@Column({name:'event_type', type:'string', length:100, nullable:false, })
 event_type :'edited'| 'reaction'| 'status'| 'poll_vote'| 'system'

@Column({name:'created_at', type:'string', length:100, nullable:false, })
created_at:string;

@Column({name:'raw_payload', type:'json', length:100, nullable:false, })
 raw_payload:string; 
  
    @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
      createdAt: Date;
    
    @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
    updatedAt: Date;
    
    @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
    deletedAt: Date | null;
}
