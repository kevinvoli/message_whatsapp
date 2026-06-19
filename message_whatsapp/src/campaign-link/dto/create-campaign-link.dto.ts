import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCampaignLinkDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  channel_id: string;

  @IsString()
  @IsNotEmpty()
  predefined_message: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
