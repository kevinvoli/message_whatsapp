import { IsString, IsNotEmpty } from 'class-validator';

export class CreateWhatsappChatLabelDto {
  @IsString()
  @IsNotEmpty()
  chat_label_id: string;

  @IsString()
  @IsNotEmpty()
  chat_id: string;

  @IsString()
  @IsNotEmpty()
  label_external_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  color: string;

  @IsString()
  @IsNotEmpty()
  count: string;
}
