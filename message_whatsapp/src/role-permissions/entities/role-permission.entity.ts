import { Permissions } from "../../permissions/entities/permission.entity";
import { Roles } from "../../roles/entities/role.entity";
import { 
  Column, 
  CreateDateColumn, 
  DeleteDateColumn, 
  Entity, 
  Index, 
  JoinColumn, 
  ManyToOne, 
  PrimaryGeneratedColumn, 
  UpdateDateColumn,
  PrimaryColumn
} from "typeorm";


@Entity("role_permissions" )
export class RolePermissions {
  @PrimaryGeneratedColumn({ 
    type: "integer", 
    name: "id",
    comment: "Primary key (auto-increment)" 
  })
  id: number;

  @PrimaryColumn("integer", { 
    name: "role_id",
    comment: "Foreign key to roles table" 
  })
  roleId: number;

  @PrimaryColumn("integer", { 
    name: "permission_id",
    comment: "Foreign key to permissions table" 
  })
  permissionId: number;

  @Column("boolean", {
    name: "is_active",
    default: true,
    comment: "Flag to enable/disable the permission"
  })
  isActive: boolean;

  @CreateDateColumn({ 
    type: "timestamp with time zone", 
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
    precision: 3 // Précision en millisecondes
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
    name: "deleted_at", // Correction orthographique
    nullable: true,
    precision: 3
  })
  deletedAt?: Date;

  // Relations
  @ManyToOne(() => Permissions, (permission) => permission.roles, {
    nullable: false,
    onDelete: "CASCADE" // Supprime la liaison si permission supprimée
  })
  @JoinColumn({ 
    name: "permission_id",
    referencedColumnName: "id",
    foreignKeyConstraintName: "fk_role_permissions_permission" 
  })
  permission: Permissions;

  @ManyToOne(() => Roles, (role) => role.permissions, {
    nullable: false,
    onDelete: "CASCADE" // Supprime la liaison si rôle supprimé
  })
  @JoinColumn({ 
    name: "role_id",
    referencedColumnName: "id",
    foreignKeyConstraintName: "fk_role_permissions_role" 
  })
  roles: Roles; // Nom au singulier pour cohérence

  // Méthode utilitaire
  static create(roleId: number, permissionId: number): RolePermissions {
    const rp = new RolePermissions();
    rp.roleId = roleId;
    rp.permissionId = permissionId;
    return rp;
  }
}