export class CreateBroadcastDto {
  tenant_id: string;
  name: string;
  template_id: string;
  channel_id: string;
  scheduled_at?: string | null;
  created_by?: string | null;
}

export class AddRecipientsDto {
  recipients: Array<{
    phone: string;
    variables?: Record<string, string> | null;
  }>;
}
