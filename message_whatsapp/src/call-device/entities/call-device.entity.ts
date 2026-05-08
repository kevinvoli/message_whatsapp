import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Annuaire des appareils téléphoniques (device_id) découverts lors de la sync call_logs DB2.
 * Permet d'associer manuellement chaque device à un poste (channel.poste_id).
 */
@Entity({ name: 'call_device' })
export class CallDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Identifiant du dispositif (device_id issu de call_logs DB2). */
  @Column({ name: 'device_id', type: 'varchar', length: 64, unique: true })
  deviceId: string;

  /** Libellé libre pour nommer l'appareil (ex : "Poste Bureau 12"). */
  @Column({ name: 'label', type: 'varchar', length: 128, nullable: true })
  label: string | null;

  /** Référence au poste DB1 (channel.poste_id) associé manuellement par l'admin. */
  @Column({ name: 'poste_id', type: 'varchar', length: 64, nullable: true })
  posteId: string | null;

  /** Date du premier appel observé pour ce device. */
  @Column({ name: 'first_seen', type: 'datetime' })
  firstSeen: Date;

  /** Date du dernier appel observé pour ce device. */
  @Column({ name: 'last_seen', type: 'datetime' })
  lastSeen: Date;

  /** Nombre total d'appels observés pour ce device. */
  @Column({ name: 'call_count', type: 'int', default: 0 })
  callCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
