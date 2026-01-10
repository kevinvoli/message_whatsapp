import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappChatEvent {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
    id: string;

    @Column({name:'chat_event_id', type:'string', length:100, nullable:false, })
   chat_event_id:string;

  @Column({name:'chat_id', type:'string', length:100, nullable:false, })
 chat_id :string;

@Column({name:'event_type', type:'string', length:100, nullable:false, })
 event_type :string;

@Column({name:'value', type:'string', length:100, nullable:false, })
 value:string;

@Column({name:'timestamp', type:'string', length:100, nullable:false, })
 timestamp:string;

@Column({name:'raw_payload', type:'string', length:100, nullable:false, })
 raw_payload :string;
   
  
    @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
      createdAt: Date;
    
    @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
    updatedAt: Date;
    
    @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
    deletedAt: Date | null;
}
