import { IsOptional, IsString } from 'class-validator';

export class CompleteFollowUpDto {
  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
