import { RolePermissions } from "../../role-permissions/entities/role-permission.entity";
import { 
  Column, 
  CreateDateColumn, 
  DeleteDateColumn, 
  Entity, 

  OneToMany, 
  PrimaryGeneratedColumn, 
  UpdateDateColumn,

} from "typeorm";

export enum Action {
  Read = 'read',
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  Manage = 'manage',
}


@Entity("permissions"  )
export class Permissions {
  @PrimaryGeneratedColumn({ 
    type: "integer", 
    name: "id",
    comment: "Primary key (auto-increment)" 
  })
  id: number;

 @Column("varchar", { 
    name: "resource",
    length: 100,
    nullable: true,
    comment: "resource permission resource"
  })
  ressource: string;

  @Column("enum", {
    enum: Action,
    name: "action",
    nullable: true,
    default: Action.Read,
    comment: "Type of action allowed"
  })
  action: Action;

  @Column("varchar", { 
    name: "name",
    length: 100,
    nullable: false,
    comment: "Human-readable permission name"
  })
  name: string;

  @Column("jsonb", { 
    name: "conditions",
    nullable: true,
    comment: "Additional access conditions in JSON format"
  })
  conditions: Record<string, any> | null;

  @Column("varchar", {
    name: "description",
    length: 255,
    nullable: true,
    comment: "Explanation of permission scope"
  })
  description?: string;

  @CreateDateColumn({ 
    type: "timestamp with time zone", 
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
    precision: 3
  })
  createdAt: Date;

  @UpdateDateColumn({ 
    type: "timestamp with time zone", 
    name: "updated_at",
    default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP",
    precision: 3
  })
  updatedAt: Date;

  @DeleteDateColumn({ 
    type: "timestamp with time zone", 
    name: "deleted_at",
    nullable: true,
    precision: 3
  })
  deletedAt?: Date;

  // Relations
  @OneToMany(() => RolePermissions, (rolePermission) => rolePermission.permission, {
    cascade: true
  })
  roles: RolePermissions[];
  
}