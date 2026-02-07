import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { WhapiService } from './whapi.service';

import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';


@Controller('webhooks/whapi')
export class WhapiController {
  constructor(private readonly whapiService: WhapiService) {}
   @Post()
  async handleWebhook(@Body() payload: WhapiWebhookPayload) {
    console.log("mon payload whapi==============", payload);
    const eventType = payload.event.type;
    try {
      
  switch (eventType) {
    case 'messages':
      // Traiter les messages
      // console.log('Événement messages:', payload.messages);
     await this.whapiService.handleIncomingMessage(payload);

      break;
    case 'statuses':
      // Traiter les statuts
      // console.log('Événement statuses:', payload.statuses);

     await this.whapiService.updateStatusMessage(payload);

      break;
    case 'events':
      // Traiter les événements (calls, joins, etc.)
      console.log('Événement events:', payload.events);
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
    // case 'hsm':
    //   // Traiter les HSM (templates)
    //   console.log('Événement hsm:', payload.hsms);
    //   break;
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
    // case 'invites':
    //   // Traiter les invitations
    //   console.log('Événement invites:', payload.invites);
    //   break;
   default:
          throw new HttpException(
            `Unsupported event type: ${eventType}`,
            HttpStatus.BAD_REQUEST,
          );
  }
    } catch (err) {
      throw new HttpException(
        {
          status: 'error',
          message: err.message || 'Webhook processing failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }


    return { status: 'ok' };
  }
}
// https://kasie-gooier-sanford.ngrok-free.dev/webhooks/whapi