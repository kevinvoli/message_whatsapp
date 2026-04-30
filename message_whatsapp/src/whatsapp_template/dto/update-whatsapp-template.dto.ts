import { IsOptional, IsString } from 'class-validator';

/**
 * DTO pour la re-soumission d'un template rejeté.
 * Tous les champs sont optionnels : on n'applique que ceux fournis.
 */
export class UpdateWhatsappTemplateDto {
  /**
   * Nouveau nom du template (optionnel).
   */
  @IsString()
  @IsOptional()
  name?: string;

  /**
   * Code langue du template (optionnel). Ex: "fr", "en"
   */
  @IsString()
  @IsOptional()
  language?: string;

  /**
   * Catégorie du template (optionnel). Ex: MARKETING, UTILITY, AUTHENTICATION
   */
  @IsString()
  @IsOptional()
  category?: string;

  /**
   * Composants du template (header, body, footer, buttons) au format JSON (optionnel).
   */
  @IsOptional()
  components?: any;
}
