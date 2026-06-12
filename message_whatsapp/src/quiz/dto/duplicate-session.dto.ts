import { IsArray, IsDateString } from 'class-validator';

export class DuplicateSessionDto {
  @IsArray()
  @IsDateString(undefined, { each: true })
  targetDates: string[];
}
