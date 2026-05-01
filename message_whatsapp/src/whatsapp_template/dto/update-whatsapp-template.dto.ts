import { IsOptional, IsString } from 'class-validator';

export class UpdateWhatsappTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsOptional()
  components?: any;
}
