import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  @IsIn(['whapi', 'meta'])
  provider?: 'whapi' | 'meta';

  @IsOptional()
  @IsString()
  channel_id?: string;

  @IsOptional()
  @IsString()
  external_id?: string;

  @IsOptional()
  @IsBoolean()
  is_business?: boolean;

  @IsOptional()
  @IsString()
  label?: string;
}
