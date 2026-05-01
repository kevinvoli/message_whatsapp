import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOutboundMessageDto {
  @IsString()
  @IsNotEmpty()
  channel_id: string;

  @IsString()
  @IsNotEmpty()
  recipient: string;

  @IsString()
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  template_id?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  template_params?: string[];

  @IsString()
  @IsOptional()
  contact_name?: string;
}
