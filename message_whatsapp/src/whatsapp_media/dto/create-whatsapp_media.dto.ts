import { IsString, IsOptional, IsEnum, IsNumber, IsUrl } from 'class-validator';
import { WhatsappMediaType } from '../entities/whatsapp_media.entity';

export class CreateWhatsappMediaDto {
  @IsString()
  chat_id: string; // chat auquel appartient le media

  @IsString()
  message_id: string; // message auquel le media est lié

  // @IsEnum(WhatsappMediaType)
  type: WhatsappMediaType; // type de media : image, video, audio, document, voice, location

  @IsString()
  media_id: string; // identifiant du media dans Whapi

  @IsOptional()
  @IsUrl()
  url?: string; // url publique ou locale du media

  @IsOptional()
  @IsString()
  mime_type?: string; // type MIME du fichier

  @IsOptional()
  @IsString()
  caption?: string; // légende pour image/video

  @IsOptional()
  @IsString()
  file_name?: string; // nom du fichier (document)

  @IsOptional()
  @IsString()
  file_size?: string; // taille du fichier en octets

  @IsOptional()
  @IsNumber()
  duration_seconds?: number; // durée pour audio/voice/video

  @IsOptional()
  @IsNumber()
  latitude?: number; // pour location

  @IsOptional()
  @IsNumber()
  longitude?: number; // pour location
}
