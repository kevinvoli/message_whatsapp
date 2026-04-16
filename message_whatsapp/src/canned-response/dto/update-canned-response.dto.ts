export class UpdateCannedResponseDto {
  shortcode?: string;
  title?: string;
  body?: string;
  category?: string | null;
  poste_id?: string | null;
  is_active?: boolean;
}
