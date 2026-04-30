import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { WhatsappTemplateStatus } from '../entities/whatsapp_template.entity';

export class CreateWhatsappTemplateDto {
  /**
   * UUID de l'entité WhapiChannel (id, pas channel_id Whapi).
   */
  @IsString()
  @IsNotEmpty()
  channelId: string;

  /**
   * Nom du template tel qu'enregistré chez Meta/Whapi.
   * Ex: "bonjour_bienvenue"
   */
  @IsString()
  @IsNotEmpty()
  name: string;

  /**
   * Code langue du template. Ex: "fr", "en"
   */
  @IsString()
  @IsOptional()
  language?: string;

  /**
   * Catégorie du template (MARKETING, UTILITY, AUTHENTICATION…).
   */
  @IsString()
  @IsOptional()
  category?: string;

  /**
   * Statut de validation du template côté Meta.
   */
  @IsEnum(WhatsappTemplateStatus)
  @IsOptional()
  status?: WhatsappTemplateStatus;

  /**
   * Composants du template (header, body, footer, buttons) au format JSON.
   * Structure libre conforme à l'API Meta/Whapi.
   */
  @IsOptional()
  components?: any;

  /**
   * ID externe du template chez Meta (optionnel).
   */
  @IsString()
  @IsOptional()
  externalId?: string;
}
