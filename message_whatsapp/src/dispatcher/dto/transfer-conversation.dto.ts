import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class TransferConversationDto {
  @IsString()
  @IsNotEmpty()
  to_poste_id: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
