import { IsInt, Max, Min } from 'class-validator';

export class MessageRestrictionConfigDto {
  @IsInt()
  @Min(1)
  @Max(500)
  maxWordLength: number;

  @IsInt()
  @Min(1)
  @Max(100)
  maxRepeatedChars: number;

  @IsInt()
  @Min(1)
  @Max(300)
  minAudioDurationSeconds: number;
}
