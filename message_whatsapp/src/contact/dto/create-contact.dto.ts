import { IsOptional, IsString } from 'class-validator';

export class CreateContactDto {
  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  name?: string;
}
