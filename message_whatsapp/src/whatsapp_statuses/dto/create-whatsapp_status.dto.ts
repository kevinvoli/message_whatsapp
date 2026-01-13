import { IsInt, IsOptional, IsString } from "class-validator";

export class CreateWhatsappStatusDto {
  @IsString()
  @IsOptional()
  id: string;

  @IsInt()
  code: number;

  @IsString()
  status: string;

  @IsString()
  recipient_id: string;

  @IsOptional()
  timestamp: number | string;
}
