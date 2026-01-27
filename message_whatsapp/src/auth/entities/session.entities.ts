// import {
//   Column,
//   CreateDateColumn,
//   PrimaryGeneratedColumn,
//   UpdateDateColumn,
// } from 'typeorm';

// export class WhatsappPoste {
//   @PrimaryGeneratedColumn('uuid', {
//     name: 'id',
//     comment: 'Primary key - Unique trajet identifier',
//   })
//   id: string;

//   @Column({
//     name: 'commercial_id',
//     type: 'varchar',
//     length: 100,
//     nullable: false,
//     unique: true,
//   })
//   commercial_id: string;
//   // (SUPPORT, VENTE…)

//   @Column({
//     name: 'poste_id',
//     type: 'varchar',
//     length: 100,
//     nullable: false,
//     unique: true,
//   })
//   poste_id: string; //(Service client)

  
//   @Column({
//     name: 'description',
//     type: 'varchar',
//     length: 100,
//     nullable: false,
//     unique: true,
//   })
//   description: string;


//   @Column({
//     name: 'description',
//     type: 'varchar',
//     length: 100,
//     nullable: false,
//     unique: true,
//   })
//   is_active: boolean;
  
//   @CreateDateColumn({
//     name: 'created_at',
//     type: 'timestamp',
//     default: () => 'CURRENT_TIMESTAMP',
//   })
//   created_at: Date;

//   @UpdateDateColumn({
//     name: 'updated_at',
//     type: 'timestamp',
//     default: () => 'CURRENT_TIMESTAMP',
//     onUpdate: 'CURRENT_TIMESTAMP',
//   })
//   updated_at: Date;
// }
