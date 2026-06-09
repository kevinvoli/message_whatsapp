import { IsBoolean, IsArray, IsIn } from 'class-validator';

const VALID_TYPES = [
  'image',
  'video',
  'audio',
  'document',
  'voice',
  'sticker',
  'gif',
] as const;

export class UpdatePostePanelDto {
  @IsBoolean()
  enabled: boolean;

  @IsArray()
  @IsIn(VALID_TYPES, { each: true })
  types: string[];
}
