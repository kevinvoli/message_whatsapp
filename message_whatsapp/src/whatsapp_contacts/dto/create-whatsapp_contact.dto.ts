import { IsString, IsNotEmpty } from 'class-validator';

export class CreateWhatsappContactDto {
  @IsString()
  @IsNotEmpty()
  contact_id: string;

  @IsString()
  @IsNotEmpty()
  message_content_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  vcard: string;
}
