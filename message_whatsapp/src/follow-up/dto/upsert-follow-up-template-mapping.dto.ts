import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertFollowUpTemplateMappingDto {
  @IsString()
  @MaxLength(36)
  template_id: string;

  @IsString()
  @MaxLength(512)
  template_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  language_code?: string;
}
