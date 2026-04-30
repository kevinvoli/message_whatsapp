export class CreateWhatsappTemplateDto {
  tenant_id?: string;
  channel_id?: string;
  name: string;
  category: string;
  language: string;
  body_text: string;
  header_type?: string;
  header_content?: string;
  footer_text?: string;
}
