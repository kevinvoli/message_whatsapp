import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from './whatsapp_commercial/entities/user.entity';
import { WhapiChannel } from './channel/entities/channel.entity';
import { WhatsappChat } from './whatsapp_chat/entities/whatsapp_chat.entity';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getStats() {
    const [commerciaux, totalCanaux, totalConversations, commerciauxActifs] = await Promise.all([
      this.commercialRepo.count(), // Use count() for total number
      this.channelRepo.count(),
      this.chatRepo.count(),
      this.commercialRepo.count({ where: { isConnected: true } }),
    ]);
    
    return {
      commerciaux: commerciaux,
      canaux: totalCanaux,
      conversations: totalConversations,
      commerciauxActifs: commerciauxActifs,
      // Les métriques suivantes nécessiteraient des entités ou des logiques métier supplémentaires
      // pour des calculs précis, et sont donc omises pour éviter des données statiques trompeuses.
      // totalConversions: 0,
      // totalCA: 0,
      // totalMessages: 0,
      // totalConversationsActives: 0,
      // tauxConversionMoyen: 0,
      // satisfactionMoyenne: "0",
      // objectifGlobal: 0,
      // caObjectifGlobal: 0,
      // totalRDV: 0,
      // totalRDVHonores: 0,
      // totalDevis: 0,
      // totalDevisAcceptes: 0,
      // totalAppelsSortants: 0,
      // totalAppelsRecus: 0,
      // totalNouveauxContacts: 0,
      // panierMoyen: 0,
      // tauxFidelisationMoyen: 0,
      // productiviteMoyenne: 0,
    };
  }
}
