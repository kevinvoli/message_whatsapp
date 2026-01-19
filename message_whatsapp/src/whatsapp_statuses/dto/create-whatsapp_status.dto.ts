import { IsString, IsNotEmpty, IsInt, IsBoolean } from 'class-validator';

export class CreateWhatsappStatusDto {
  @IsString()
  @IsNotEmpty()
  status_id: string;

  @IsInt()
  @IsNotEmpty()
  code: number;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsNotEmpty()
  recipient_id: string;

  @IsString()
  @IsNotEmpty()
  viewer_id: string;

  @IsString()
  @IsNotEmpty()
  timestamp: string;
}
