import { IsBoolean } from 'class-validator';

export class SetExemptDto {
  @IsBoolean()
  exempt: boolean;
}
