import { IsString, IsNotEmpty, IsPhoneNumber, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWhatsappAgentDto {
  @IsString()
  @IsNotEmpty()
  agent_id: string;

  @IsPhoneNumber(null)
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @Type(() => Date)
  @IsDate()
  @IsNotEmpty()
  created_at: Date;
}
