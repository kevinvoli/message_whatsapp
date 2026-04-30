import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * DTO pour l'initiation d'une conversation sortante par l'admin.
 *
 * Permet d'envoyer un premier message à un contact qui n'existe pas encore
 * en base de données, sans qu'une conversation soit préalablement ouverte.
 *
 * Contrainte WhatsApp / Meta :
 * - provider = meta et contact hors fenêtre 24h → template_id obligatoire
 * - provider = whapi → texte libre OK (Whapi contourne la règle des 24h)
 *
 * Exactement l'un de `text` ou `template_id` doit être fourni.
 */
export class CreateOutboundMessageDto {
  /**
   * channel_id (identifiant Whapi/Meta) du canal à utiliser pour l'envoi.
   * Exemple : "35674@c.us" pour Whapi, ou un UUID pour Meta/Messenger.
   */
  @IsString()
  @IsNotEmpty()
  channel_id: string;

  /**
   * Identifiant du destinataire selon le provider :
   * - whapi / meta   : numéro E.164 sans le "+" (ex: "2250700000000")
   * - messenger      : PSID (identifiant utilisateur Messenger)
   * - instagram      : IGSID (identifiant utilisateur Instagram)
   * - telegram       : chat_id Telegram
   */
  @IsString()
  @IsNotEmpty()
  recipient: string;

  /**
   * Texte libre du message à envoyer.
   * Requis si template_id absent.
   * Pour provider=meta, l'envoi en texte libre est rejeté hors fenêtre 24h.
   */
  @IsString()
  @IsOptional()
  text?: string;

  /**
   * UUID du template WhatsApp à utiliser (table whatsapp_template).
   * Requis pour provider=meta si le contact est hors fenêtre 24h.
   * Optionnel pour provider=whapi (texte libre préféré).
   */
  @IsString()
  @IsOptional()
  template_id?: string;

  /**
   * Valeurs des paramètres du template body ({{1}}, {{2}}, etc.)
   * dans l'ordre d'apparition.
   * Ignoré si template_id absent.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  template_params?: string[];

  /**
   * Nom affiché pour le contact créé à la volée (optionnel).
   * Si absent, le numéro/PSID est utilisé comme nom.
   */
  @IsOptional()
  @IsString()
  contact_name?: string;
}
