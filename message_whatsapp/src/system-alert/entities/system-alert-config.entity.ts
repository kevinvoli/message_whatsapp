import { Column, Entity, PrimaryColumn } from 'typeorm';

export interface AlertRecipient {
  phone: string; // format international sans + ni 00, ex: 225556789012
  name: string;
}

/**
 * Singleton (id = 1) — une seule ligne en BDD pour stocker la config de l'alerte système.
 */
@Entity('system_alert_config')
export class SystemAlertConfig {
  @PrimaryColumn()
  id: number;

  @Column({ default: true })
  enabled: boolean;

  /** Durée de silence (en minutes) avant déclenchement de l'alerte */
  @Column({ name: 'silence_threshold_minutes', default: 60 })
  silenceThresholdMinutes: number;

  /** Délai avant retry si l'envoi WhatsApp a échoué */
  @Column({ name: 'retry_after_minutes', default: 15 })
  retryAfterMinutes: number;

  /**
   * Liste des destinataires au format JSON.
   * Chaque entrée : { phone: "225XXXXXXXXX", name: "Mr X" }
   * Format phone : international sans + ni 00 (ex: 225556789012 pour la CI)
   */
  @Column({ type: 'json' })
  recipients: AlertRecipient[];

  /**
   * Modèle du message d'alerte. Placeholder disponible : {silenceMin}
   * Exemple : "🚨 *ALERTE* — Aucun message depuis *{silenceMin} min*. Vérifiez le serveur."
   */
  @Column({
    name: 'message_template',
    type: 'text',
    nullable: true,
  })
  messageTemplate: string | null;

  /**
   * Canal Whapi à utiliser en priorité pour l'envoi des alertes.
   * Si null → le système essaie tous les canaux Whapi disponibles dans l'ordre.
   * Valeur : `channel_id` externe (ex: "5c4b..."), pas l'UUID interne.
   */
  @Column({
    name: 'default_channel_id',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  defaultChannelId: string | null;
}
