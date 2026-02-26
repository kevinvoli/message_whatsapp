import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AutoMessageScopeType {
  POSTE = 'poste',
  CANAL = 'canal',
  PROVIDER = 'provider',
}

@Entity({ name: 'auto_message_scope_config', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
@Index('UQ_auto_message_scope', ['scope_type', 'scope_id'], { unique: true })
export class AutoMessageScopeConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'scope_type',
    type: 'enum',
    enum: AutoMessageScopeType,
    nullable: false,
  })
  scope_type: AutoMessageScopeType;

  /** ID du poste, du canal (channel_id) ou du provider (ex: 'whapi', 'meta') */
  @Column({ name: 'scope_id', type: 'varchar', length: 100, nullable: false })
  scope_id: string;

  /** Libellé lisible pour l'affichage admin */
  @Column({ name: 'label', type: 'varchar', length: 200, nullable: true })
  label?: string | null;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
