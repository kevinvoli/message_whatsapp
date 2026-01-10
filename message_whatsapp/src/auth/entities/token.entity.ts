import { 
  Column, 
  CreateDateColumn, 
  DeleteDateColumn, 
  Entity, 
  Index, 
  PrimaryGeneratedColumn, 
  UpdateDateColumn
} from "typeorm";

export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
  VERIFICATION = 'verification',
  PASSWORD_RESET = 'password_reset'
}

@Entity("tokens")
@Index("tokens_user_id_idx", ["userId"])
@Index("tokens_access_token_idx", ["accessToken"])
@Index("tokens_refresh_token_idx", ["refreshToken"])
export class Token {
  @PrimaryGeneratedColumn('increment', { 
    type: 'integer',
    name: 'id',
    comment: 'Primary key (auto-increment)' 
  })
  id: number;
  
  @Column("text", {  // Changé de varchar(255) à text
    name: "access_token",
    unique: true,
    comment: "JWT access token string",
    nullable:true
  })
  accessToken?: string;

  @Column("varchar", { 
    name: "role",
    length: 255,
    nullable: true,
    comment: "User role"
  })
  role: string | null;

  @Column("text", {  // Changé de varchar(255) à text
    name: "refresh_token",
    unique: true,
    comment: "JWT refresh token string",
    nullable: true,
  })
  refreshToken: string;

  @Column("integer", { 
    name: "user_id",
    nullable: false,
    comment: "Reference to user this token belongs to"
  })
  userId: number;

  @Column("enum", {
    enum: TokenType,
    enumName: "token_type_enum",
    default: TokenType.ACCESS,
    comment: "Type of token"
  })
  type: TokenType;

  @CreateDateColumn({ 
    type: "timestamp with time zone", 
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
    comment: "When the token was issued"
  })
  createdAt: Date;

  @UpdateDateColumn({ 
    type: "timestamp with time zone", 
    name: "updated_at",
    default: () => "CURRENT_TIMESTAMP",
    comment: "When the token was last updated"
  })
  updatedAt: Date;

  @DeleteDateColumn({ 
    type: "timestamp with time zone", 
    name: "deleted_at",
    nullable: true,
    comment: "When the token was revoked"
  })
  deletedAt?: Date;
}