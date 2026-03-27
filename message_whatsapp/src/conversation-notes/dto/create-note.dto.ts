import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsEnum(['commercial', 'admin'])
  @IsOptional()
  authorType?: 'commercial' | 'admin';
}
