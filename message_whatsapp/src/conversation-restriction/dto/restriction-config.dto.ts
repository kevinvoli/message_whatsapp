export class RestrictionConfigDto {
  enabled: boolean;
  maxUnrespondedConvs: number;
  minResponseChars: number;
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
