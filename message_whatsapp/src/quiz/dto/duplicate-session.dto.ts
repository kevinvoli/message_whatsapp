import { ArrayNotEmpty, IsArray, IsDateString } from 'class-validator';

export class DuplicateSessionDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsDateString(undefined, { each: true })
  targetDates: string[];
}
