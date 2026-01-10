import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappChat {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
    id: string;
  
    @Column({name:'chat_id', type:'string', length:100, nullable:false, })
   chat_id :string;                // chat_id WHAPI

   @Column({name:'name', type:'string', length:100, nullable:false, })
 name:string;

@Column({name:'type', type:'string', length:100, nullable:false, })
 type     :string;              // private | group | newsletter

@Column({name:'chat_pic', type:'string', length:100, nullable:false, })
 chat_pic:string;

@Column({name:'chat_pic_full', type:'string', length:100, nullable:false, })
chat_pic_full:string;

@Column({name:'is_pinned', type:'string', length:100, nullable:false, })
 is_pinned:string;

@Column({name:'is_muted', type:'string', length:100, nullable:false, })
 is_muted:string;

@Column({name:'mute_until', type:'string', length:100, nullable:false, })
 mute_until:string;

@Column({name:'is_archived', type:'string', length:100, nullable:false, })
 is_archived:string;

@Column({name:'unread_count', type:'string', length:100, nullable:false, })
unread_count:string;

@Column({name:'unread_mention', type:'string', length:100, nullable:false, })
 unread_mention:string;

@Column({name:'read_only', type:'string', length:100, nullable:false, })
 read_only:string;

@Column({name:'not_spam', type:'string', length:100, nullable:false, })
 not_spam:string;

@Column({name:'last_activity_at', type:'string', length:100, nullable:false, })
 last_activity_at :string;      // timestamp

@Column({name:'created_at', type:'string', length:100, nullable:false, })
created_at:string;

@Column({name:'updated_at', type:'string', length:100, nullable:false, })
updated_at:string;


  
    @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
      createdAt: Date;
    
    @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
    updatedAt: Date;
    
    @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
    deletedAt: Date | null;
}
