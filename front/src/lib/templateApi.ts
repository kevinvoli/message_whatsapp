import axios from 'axios';

const base = process.env.NEXT_PUBLIC_API_URL;

export interface FrontHsmTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  body_text: string;
  body_example_variables: string[] | null;
  header_text: string | null;
  footer_text: string | null;
}

export interface SendTemplateData {
  chatId: string;
  channelId: string;
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
}

export async function getApprovedTemplates(tenantId?: string): Promise<FrontHsmTemplate[]> {
  const params = new URLSearchParams({ status: 'APPROVED' });
  if (tenantId) params.set('tenant_id', tenantId);
  const r = await axios.get(`${base}/templates?${params.toString()}`, {
    withCredentials: true,
  });
  return r.data;
}

export async function sendTemplate(data: SendTemplateData): Promise<void> {
  await axios.post(`${base}/messages/template`, data, { withCredentials: true });
}
