import { RolePermissions } from "../../role-permissions/entities/role-permission.entity";
import { Users } from "../../users/entity/users.entity";
import { slugify } from "../../utils/helpers";
import { 
  Column, 
  CreateDateColumn, 
  DeleteDateColumn, 
  Entity, 
  Index, 
  OneToMany, 
  PrimaryGeneratedColumn, 
  UpdateDateColumn,
  BeforeInsert,
  BeforeUpdate 
} from "typeorm";


@Entity("roles" )
export class Roles {
  @PrimaryGeneratedColumn({ 
    type: "integer", 
    name: "id" 
  })
  id: number;

  @Column("varchar", { 
    name: "name", 
    length: 50,
    unique: true,
    nullable: false
  })
  name: string;


  // Relations
  @OneToMany(() => RolePermissions, (permission) => permission.roles, {
    cascade: true // Suppression en cascade des permissions
  })
  permissions: RolePermissions[];

  @OneToMany(() => Users, (user) => user.role, {
    onDelete: "SET NULL" // Conserve les users si rôle supprimé
  })
  users: Users[];

}