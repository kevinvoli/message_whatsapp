export interface CommercialDashboardDto {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline';
  email: string;
  region: string;
  dernierLogin: string;
  messagesEnvoyes: number;       // tous messages OUT (auto + manuels)
  messagesRecus: number;         // messages IN
  conversationsActives: number;  // chats actifs
  conversationsEnAttente: number;// chats en attente
  nouveauxContacts: number;      // contacts créés aujourd'hui
  productivite: number;          // calcul dérivé
}
