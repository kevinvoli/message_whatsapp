import { IsBoolean, IsInt, Min } from 'class-validator';

export class RestrictionConfigDto {
  @IsBoolean()
  enabled: boolean;

  @IsInt()
  @Min(1)
  maxUnrespondedConvs: number;

  @IsInt()
  @Min(1)
  minResponseChars: number;

  @IsBoolean()
  requireLastMessageMine: boolean;
}

export class RestrictionStatusDto {
  triggered: boolean;
  unrespondedCount: number;
  unrespondedConversations: Array<{
    chat_id: string;
    contact_name: string;
    last_client_message: string;
    accessed_at: string;
  }>;
  config: RestrictionConfigDto;
}
