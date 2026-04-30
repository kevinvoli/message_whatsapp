export class CreateOutboundMessageDto {
  channel_id: string;
  recipient: string;
  text: string;
  template_id?: string;
  template_params?: string[];
}
