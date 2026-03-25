import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';

export interface IMediaRepository {
  build(data: Partial<WhatsappMedia>): WhatsappMedia;
  save(media: WhatsappMedia): Promise<WhatsappMedia>;
}
