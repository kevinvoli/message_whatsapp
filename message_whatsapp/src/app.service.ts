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
      this.commercialRepo.find(),
      this.channelRepo.count(),
      this.chatRepo.count(),
      this.commercialRepo.count({ where: { isConnected: true } }),
    ]);

    // Pour l'instant, beaucoup de valeurs sont statiques ou simulées.
    // Elles devront être remplacées par de vrais calculs.
    const totalConversions = 38;
    const totalCA = 1130000;
    const totalMessages = 600;
    const totalConversationsActives = 41;
    const tauxConversionMoyen = 32;
    const satisfactionMoyenne = "4.7";
    const objectifGlobal = 75;
    const caObjectifGlobal = 2500000;
    
    return {
      // Données réelles
      commerciaux: commerciaux.length,
      canaux: totalCanaux,
      conversations: totalConversations,
      commerciauxActifs: commerciauxActifs,

      // Données simulées pour correspondre à l'interface StatsGlobales
      totalConversions,
      totalCA,
      totalMessages,
      totalConversationsActives,
      tauxConversionMoyen,
      satisfactionMoyenne,
      objectifGlobal,
      caObjectifGlobal,
      totalRDV: 20,
      totalRDVHonores: 15,
      totalDevis: 29,
      totalDevisAcceptes: 17,
      totalAppelsSortants: 71,
      totalAppelsRecus: 107,
      totalNouveauxContacts: 88,
      panierMoyen: 30000,
      tauxFidelisationMoyen: 75,
      productiviteMoyenne: 82,
    };
  }
}
