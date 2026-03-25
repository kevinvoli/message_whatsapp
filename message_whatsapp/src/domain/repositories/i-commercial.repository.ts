import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

export interface ICommercialRepository {
  findById(id: string): Promise<WhatsappCommercial | null>;
}
