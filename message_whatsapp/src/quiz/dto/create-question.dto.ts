import {
  IsString,
  IsUUID,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateAnswerDto {
  @IsString()
  text: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class CreateQuestionDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsNumber()
  points?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  timeLimitSeconds?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAnswerDto)
  answers: CreateAnswerDto[];
}
