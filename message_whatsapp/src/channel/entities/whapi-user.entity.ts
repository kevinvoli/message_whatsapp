import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";


@Entity('whapi_user')
export class WhapiUser {
  @PrimaryGeneratedColumn('uuid')
    id: string;

  @Column()
  name: string;

  @Column({ default: false })
  is_business: boolean;

  @Column({ nullable: true })
  profile_pic: string;

  @Column({ default: false })
  saved: boolean;
}