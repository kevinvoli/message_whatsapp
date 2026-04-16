export class CreateCannedResponseDto {
  tenant_id: string;
  poste_id?: string | null;
  shortcode: string;
  title: string;
  body: string;
  category?: string | null;
  is_active?: boolean;
}
