import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class WhatsappStatus {
  @PrimaryGeneratedColumn('uuid',{name: 'id', comment:'Primary key - Unique trajet identifier'})
    id: string;

    @Column({name:'status_id', type:'string', length:100, nullable:false, })
   status_id :string;

   @Column({name:'code', type:'string', length:100, nullable:false, })
      code: number;

      @Column({name:'status', type:'string', length:100, nullable:false, })
      status:string;
      
      @Column({name:'recipient_id', type:'string', length:100, nullable:false, })
      recipient_id: boolean

      @Column({name:'viewer_id', type:'string', length:100, nullable:false, })
      viewer_id:string;

      @Column({name:'timestamp', type:'string', length:100, nullable:false, })
      timestamp:string;
   
  
    @CreateDateColumn({name:'createdAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was created'})
      createdAt: Date;
    
    @UpdateDateColumn({name:'updatedAt', type:'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP', comment:'Timestamp when the trajet was last updated'})
    updatedAt: Date;
    
    @DeleteDateColumn({name:'deletedAt', type:'timestamp', nullable:true, comment:'Timestamp when the trajet was deleted'})
    deletedAt: Date | null;
}
