import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { WhapiService } from './whapi.service';

import { Controller, Post, Body } from '@nestjs/common';


@Controller('webhooks/whapi')
export class WhapiController {
  constructor(private readonly whapiService: WhapiService) {}
   @Post()
   handleWebhook(@Body() payload: WhapiWebhookPayload) {
    // console.log("mon payload whapi", payload);

    const eventType = payload.event.type;
  switch (eventType) {
    case 'messages':
      // Traiter les messages
      // console.log('Événement messages:', payload.messages);
     this.whapiService.handleIncomingMessage(payload);

      break;
    case 'statuses':
      // Traiter les statuts
      // console.log('Événement statuses:', payload.statuses);

      this.whapiService.updateStatusMessage(payload);

      break;
    case 'events':
      // Traiter les événements (calls, joins, etc.)
      this.whapiService.handleEvent(payload);
      break;
    case 'polls':
      // Traiter les sondages
      console.log('Événement polls:', payload.polls);
      break;
    case 'interactive':
      // Traiter les interactions (boutons, listes)
      console.log('Événement interactive:', payload.interactives);
      break;
    case 'contacts':
      // Traiter les contacts
      console.log('Événement contacts:', payload.contacts);
      break;
    case 'locations':
      // Traiter les localisations
      console.log('Événement locations:', payload.locations);
      break;
    case 'live_locations':
      // Traiter les localisations en direct
      console.log('Événement live_locations:', payload.live_locations);
      break;
    case 'hsm':
      // Traiter les HSM (templates)
      console.log('Événement hsm:', payload.hsms);
      break;
    case 'orders':
      // Traiter les commandes
      console.log('Événement orders:', payload.orders);
      break;
    case 'products':
      // Traiter les produits
      console.log('Événement products:', payload.products);
      break;
    case 'catalogs':
      // Traiter les catalogues
      console.log('Événement catalogs:', payload.catalogs);
      break;
    case 'invites':
      // Traiter les invitations
      console.log('Événement invites:', payload.invites);
      break;
    default:
      // Cas par défaut pour les types non reconnus (bien que le type garantisse l'exhaustivité)
      console.log('Type d\'événement inconnu:', eventType);
      break;
  }
    return { status: 'ok' };
  }
}
// https://kasie-gooier-sanford.ngrok-free.dev/webhooks/whapi