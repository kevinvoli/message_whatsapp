import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappMessageReaction {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
  id: string;


  @Column({name:'message_reaction', type:'string', length:100, nullable:false, })
  message_reaction:string;

  @Column({name:'message_id', type:'string', length:100, nullable:false, })
message_id :string;

@Column({name:'emoji', type:'string', length:100, nullable:false, })
 emoji:string;

@Column({name:'author', type:'string', length:100, nullable:false, })
 author:string;

@Column({name:'count', type:'string', length:100, nullable:false, })
 count:string;
 @Column({name:'unread', type:'string', length:100, nullable:false, })
 unread:string;


@Column({name:'reacted_at', type:'string', length:100, nullable:false, })
 reacted_at:string;
 

  @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
    createdAt: Date;
  
  @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
  updatedAt: Date;
  
  @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
  deletedAt: Date | null;}
