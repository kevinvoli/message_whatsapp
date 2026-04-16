import { TemplateCategory, TemplateHeaderType } from '../entities/whatsapp-template.entity';

export class CreateTemplateDto {
  tenant_id: string;
  channel_id?: string | null;
  name: string;
  category?: TemplateCategory;
  language?: string;
  header_type?: TemplateHeaderType | null;
  header_content?: string | null;
  body_text: string;
  footer_text?: string | null;
  parameters?: Record<string, unknown>[] | null;
  buttons?: Record<string, unknown>[] | null;
}
