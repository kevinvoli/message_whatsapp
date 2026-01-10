import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappError {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
    id: string;
  

    @Column({name:'code', type:'int', length:100, nullable:false, })
     code: number

     @Column({name:'message', type:'string', length:100, nullable:false, })
    message: string;

    @Column({name:'details', type:'string', length:100, nullable:false, })
    details: string;

    @Column({name:'href', type:'string', length:100, nullable:false, })
    href: string;

    @Column({name:'support', type:'string', length:100, nullable:false, })
    support: string;
   
  
    @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
      createdAt: Date;
    
    @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
    updatedAt: Date;
    
    @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
    deletedAt: Date | null;
}
