import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class AnswerSubmission {
  @IsUUID()
  questionId: string;

  @IsOptional()
  @IsUUID()
  answerId: string | null;

  @IsBoolean()
  timedOut: boolean;
}

export class SubmitAttemptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerSubmission)
  answers: AnswerSubmission[];

  @IsBoolean()
  timedOut: boolean;
}
