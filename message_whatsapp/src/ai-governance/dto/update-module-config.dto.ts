export class UpdateModuleConfigDto {
  is_enabled?: boolean;
  fallback_text?: string | null;
  requires_human_validation?: boolean;
  schedule_start?: string | null;
  schedule_end?: string | null;
  allowed_roles?: string[] | null;
  allowed_channels?: string[] | null;
  security_rules?: Record<string, unknown> | null;
  provider_id?: string | null;
}
