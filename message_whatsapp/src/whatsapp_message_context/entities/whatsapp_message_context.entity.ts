import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappMessageContext {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
    id: string;
  
    @Column({name:'message_context_id', type:'string', length:100, nullable:false, })
    message_context_id:string;

    @Column({name:'message_id', type:'string', length:100, nullable:false, })
 message_id :string;

@Column({name:'forwarded', type:'string', length:100, nullable:false, })
forwarded:string;

@Column({name:'forwarding_score', type:'string', length:100, nullable:false, })
 forwarding_score:string;

@Column({name:'quoted_message_id', type:'string', length:100, nullable:false, })
 quoted_message_id:string;

@Column({name:'quoted_author', type:'string', length:100, nullable:false, })
quoted_author:string;

@Column({name:'ephemeral_duration', type:'string', length:100, nullable:false, })
 ephemeral_duration:string;


   
  
    @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
      createdAt: Date;
    
    @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
    updatedAt: Date;
    
    @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
    deletedAt: Date | null;
}
